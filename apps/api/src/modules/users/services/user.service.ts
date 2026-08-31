import type { PublicUser } from "@sidewalk/shared";

import { NotFoundError } from "../../../shared/errors/AppError.js";
import { userRepository } from "../repositories/user.repository.js";
import { toPublicUser } from "../types/user.types.js";
import type { UpdateProfileInput } from "../validators/user.validator.js";

export const userService = {
  async getById(id: string): Promise<PublicUser> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError("User not found.");
    }
    return toPublicUser(user);
  },

  /** Updates the caller's own profile fields (#824). */
  async updateProfile(id: string, input: UpdateProfileInput): Promise<PublicUser> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError("User not found.");
    }
    const updated = await userRepository.update(id, input);
    return toPublicUser(updated);
  },

  /** Deletes the caller's own account (#824). */
  async deleteAccount(id: string): Promise<void> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError("User not found.");
    }
    await userRepository.delete(id);
  }
};
