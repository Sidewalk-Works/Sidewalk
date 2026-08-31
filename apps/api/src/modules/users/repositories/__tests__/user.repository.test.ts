import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../shared/database/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../../../../shared/database/prisma.js";
import { userRepository } from "../user.repository.js";
import type { User } from "../../types/user.types.js";

const mockUser: User = {
  id: "user-1",
  email: "user@example.com",
  passwordHash: "hashed-password",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
};

describe("userRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findByEmail", () => {
    it("queries prisma by email and returns the user", async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const result = await userRepository.findByEmail("user@example.com");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
      });
      expect(result).toBe(mockUser);
    });

    it("returns null when no user matches", async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await userRepository.findByEmail("missing@example.com");

      expect(result).toBeNull();
    });
  });

  describe("findById", () => {
    it("queries prisma by id and returns the user", async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const result = await userRepository.findById("user-1");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });
      expect(result).toBe(mockUser);
    });

    it("returns null when no user matches", async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await userRepository.findById("missing");

      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("creates a user with email and password hash", async () => {
      const input = { email: "new@example.com", passwordHash: "hashed-password" };
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const result = await userRepository.create(input);

      expect(prisma.user.create).toHaveBeenCalledWith({ data: input });
      expect(result).toBe(mockUser);
    });
  });
});