import request from "supertest";
import { createApp, type TestApp } from "./helpers";

describe("Health, headers and documentation", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  afterAll(() => t.close());

  it("reports liveness and readiness", async () => {
    expect((await request(t.app.getHttpServer()).get("/api/v1/health")).body.status).toBe("ok");
    const ready = await request(t.app.getHttpServer()).get("/api/v1/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.checks).toEqual({ database: "ok", storage: "ok" });
  });

  it("sets security headers and hides the framework", async () => {
    const res = await request(t.app.getHttpServer()).get("/api/v1/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("serves OpenAPI documentation in development", async () => {
    const res = await request(t.app.getHttpServer()).get("/api/docs-json");
    expect(res.status).toBe(200);
    expect(res.body.info.title).toBe("Sidewalk API");
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(["/api/v1/reports", "/api/v1/auth/login", "/api/v1/moderation/flags"])
    );
  });

  it("rejects cross-origin preflight from unknown sites", async () => {
    const res = await request(t.app.getHttpServer())
      .options("/api/v1/reports")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
  });
});
