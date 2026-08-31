import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../../app.js";
import { prisma } from "../../../shared/database/prisma.js";

describe("GET /api/users/me", () => {
  it("returns the authenticated user", async () => {
    const email = "me-owner@example.com";
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123" });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });

    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email });
    expect(res.body.id).toBeTruthy();
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  it("rejects requests without an Authorization header", async () => {
    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("rejects a malformed token", async () => {
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", "Bearer not-a-real-jwt");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("rejects a non-Bearer Authorization header", async () => {
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", "Basic dXNlcjpwYXNz");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
