import { prisma } from "../../../shared/database/prisma.js";
import type { User } from "../types/user.types.js";
import type { UpdateProfileInput } from "../validators/user.validator.js";

export const userRepository = {
  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  create(data: { email: string; passwordHash: string }): Promise<User> {
    return prisma.user.create({ data });
  },

  update(id: string, data: UpdateProfileInput): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  },

  delete(id: string): Promise<User> {
    return prisma.user.delete({ where: { id } });
  }
};
