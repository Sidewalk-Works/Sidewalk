import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "../auth.validator.js";

describe("registerSchema", () => {
  it("accepts a valid email and password", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace from the email", () => {
    const result = registerSchema.safeParse({
      email: "  user@example.com  ",
      password: "password123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(registerSchema.safeParse({ email: "user@example.com" }).success).toBe(false);
    expect(registerSchema.safeParse({ password: "password123" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a required empty password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "nope",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });
});