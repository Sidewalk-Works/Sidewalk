import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/user.repository.js", () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

import { NotFoundError } from "../../../../shared/errors/AppError.js";
import { userRepository } from "../repositories/user.repository.js";
import { userService } from "../user.service.js";
import type { User } from "../types/user.types.js";

const mockUser: User = {
  id: "user-1",
  email: "user@example.com",
  passwordHash: "hashed-password",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
};

describe("userService.getById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the public user when the user exists", async () => {
    (userRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    const result = await userService.getById("user-1");

    expect(userRepository.findById).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      id: "user-1",
      email: "user@example.com",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
  });

  it("does not leak the password hash", async () => {
    (userRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    const result = await userService.getById("user-1");

    expect(result).not.toHaveProperty("passwordHash");
  });

  it("throws NotFoundError when the user does not exist", async () => {
    (userRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(userService.getById("missing")).rejects.toBeInstanceOf(NotFoundError);
    await expect(userService.getById("missing")).rejects.toThrow("User not found.");
  });
});