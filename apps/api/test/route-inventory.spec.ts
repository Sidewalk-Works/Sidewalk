import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ModulesContainer, Reflector } from "@nestjs/core";
import { createApp, type TestApp } from "./helpers";
import {
  IS_PUBLIC,
  RATE_LIMIT_KEY,
  ROLES_KEY,
  SKIP_RATE_LIMIT_KEY
} from "../src/common/decorators";

interface Route {
  route: string;
  method: string;
  public: boolean;
  roles: string[];
  limited: boolean;
  unthrottled: boolean;
}

/** Every route the application exposes, read from the framework's own metadata. */
function inventory(t: TestApp): Route[] {
  const reflector = t.app.get(Reflector);
  const routes: Route[] = [];
  for (const module of t.app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const cls = wrapper.metatype as (new (...a: never[]) => object) | null;
      if (!cls) continue;
      const prefix = String(Reflect.getMetadata(PATH_METADATA, cls) ?? "");
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = (cls.prototype as Record<string, unknown>)[name] as
          (() => unknown) | undefined;
        if (name === "constructor" || typeof handler !== "function") continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? "");
        const targets = [handler, cls];
        routes.push({
          route: `/${[prefix, sub].filter((p) => p && p !== "/").join("/")}`.replace(/\/+/g, "/"),
          method: RequestMethod[method] as string,
          public: reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) === true,
          roles: reflector.getAllAndOverride<string[]>(ROLES_KEY, targets) ?? [],
          limited: reflector.getAllAndOverride(RATE_LIMIT_KEY, targets) !== undefined,
          unthrottled: reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, targets) === true
        });
      }
    }
  }
  return routes;
}

/** The only routes anyone may call without signing in. Adding to this list is a deliberate, reviewed decision. */
const PUBLIC_ROUTES = [
  "GET /categories",
  "GET /evidence/:id/file",
  "GET /health",
  "GET /health/ready",
  "GET /locations/reverse",
  "GET /locations/search",
  // Organization discovery: only listed profiles are ever returned (the service enforces it, and tests prove it).
  "GET /organizations",
  "GET /organizations/:slug",
  "GET /organizations/:slug/reports",
  "GET /organizations/:slug/responses",
  "GET /reports",
  "GET /reports/stats",
  "GET /reports/:reference",
  "GET /reports/:reference/comments",
  "GET /reports/map",
  "POST /auth/login",
  "POST /auth/logout",
  "POST /auth/password/forgot",
  "POST /auth/password/reset",
  "POST /auth/password/reset/check",
  "POST /auth/refresh",
  "POST /auth/register",
  "POST /auth/verification/confirm",
  "POST /auth/verification/resend",
  // Looks at an invitation link without using it. Rate limited, and reveals nothing without the secret token.
  "POST /organization-invitations/check"
];

describe("Route inventory: every endpoint's access rules are deliberate", () => {
  let t: TestApp;
  let routes: Route[];
  beforeAll(async () => {
    t = await createApp();
    routes = inventory(t);
  });
  afterAll(() => t.close());
  const key = (r: Route) => `${r.method} ${r.route.replace(/^\/api\/v1/, "")}`;

  it("finds the routes (guards against the inventory silently reading nothing)", () => {
    expect(routes.length).toBeGreaterThan(60);
  });

  it("exposes exactly the reviewed set of unauthenticated routes", () => {
    const actual = routes
      .filter((r) => r.public)
      .map(key)
      .sort();
    expect(actual).toEqual([...PUBLIC_ROUTES].sort());
  });

  it("rate limits every unauthenticated route that changes anything, except sign-out", () => {
    const loose = routes.filter((r) => r.public && r.method !== "GET" && !r.limited).map(key);
    expect(loose).toEqual(["POST /auth/logout"]);
  });

  it("exempts only liveness from rate limiting", () => {
    expect(routes.filter((r) => r.unthrottled).map(key)).toEqual(["GET /health"]);
  });

  it("restricts every moderation route to staff and every admin route to administrators", () => {
    const moderation = routes.filter((r) => r.route.startsWith("/moderation"));
    const admin = routes.filter((r) => r.route.startsWith("/admin"));
    expect(moderation.length).toBeGreaterThan(5);
    expect(admin.length).toBeGreaterThan(5);
    const wrongModeration = moderation.filter(
      (r) => [...r.roles].sort().join() !== "ADMIN,MODERATOR"
    );
    const wrongAdmin = admin.filter((r) => r.roles.join() !== "ADMIN");
    expect(wrongModeration.map(key)).toEqual([]);
    expect(wrongAdmin.map(key)).toEqual([]);
  });

  it("never marks a route both public and role-restricted", () => {
    expect(routes.filter((r) => r.public && r.roles.length > 0).map(key)).toEqual([]);
  });

  it("limits the sensitive write routes explicitly instead of leaving them on the generous default", () => {
    const mustBeLimited = [
      "POST /reports",
      "POST /reports/:reference/comments",
      "POST /reports/:reference/flags",
      "POST /reports/:reference/evidence",
      "POST /users/me/password",
      "POST /admin/email-outbox/:id/retry",
      "POST /organization-applications",
      "POST /organization-applications/:id/submit",
      "POST /organization-applications/:id/documents",
      "POST /organizations/:slug/invitations",
      "POST /organization-invitations/accept",
      "POST /reports/:reference/official-responses",
      "POST /reports/:reference/organizations",
      "POST /official-responses/:id/flags",
      "POST /admin/organizations",
      "POST /admin/organizations/applications/:id/decision",
      "POST /admin/organizations/:id/suspend",
      "POST /admin/organizations/:id/revoke-verification"
    ];
    const missing = mustBeLimited.filter((k) => !routes.some((r) => key(r) === k && r.limited));
    expect(missing).toEqual([]);
  });
});
