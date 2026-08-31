import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/auth.service.js", () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
  },
}));

import type { Request, Response } from "express";

import { ValidationError } from "../../../../shared/errors/AppError.js";
import { authService } from "../../services/auth.service.js";
import { authController } from "../auth.controller.js";

function mockReq(body: unknown): Request {
  return { body } as Request;
}

function mockRes(): Response {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe("authController.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the created public user", async () => {
    const createdUser = {
      id: "user-1",
      email: "user@example.com",
      createdAt: "2026-08-01T00:00:00.000Z",
    };
    (authService.register as ReturnType<typeof vi.fn>).mockResolvedValue(createdUser);

    const req = mockReq({ email: "user@example.com", password: "password123" });
    const res = mockRes();

    await authController.register(req, res);

    expect(authService.register).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(createdUser);
  });

  it("throws ValidationError for invalid input", async () => {
    const req = mockReq({ email: "not-an-email", password: "short" });
    const res = mockRes();

    await expect(authController.register(req, res)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(authService.register).not.toHaveBeenCalled();
  });
});

describe("authController.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with token and public user", async () => {
    const loginResult = {
      token: "jwt-token",
      user: {
        id: "user-1",
        email: "user@example.com",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    };
    (authService.login as ReturnType<typeof vi.fn>).mockResolvedValue(loginResult);

    const req = mockReq({ email: "user@example.com", password: "password123" });
    const res = mockRes();

    await authController.login(req, res);

    expect(authService.login).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(loginResult);
  });

  it("throws ValidationError for invalid input", async () => {
    const req = mockReq({ email: "user@example.com", password: "" });
    const res = mockRes();

    await expect(authController.login(req, res)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(authService.login).not.toHaveBeenCalled();
  });
});