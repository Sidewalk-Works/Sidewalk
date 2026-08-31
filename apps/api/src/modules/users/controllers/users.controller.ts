import type { Response } from "express";

import { ValidationError } from "../../../shared/errors/AppError.js";
import type { AuthenticatedRequest } from "../../../shared/middleware/requireAuth.js";
import { userService } from "../services/user.service.js";
import { updateProfileSchema } from "../validators/user.validator.js";

export const usersController = {
  async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = await userService.getById(req.userId);
    res.status(200).json(user);
  },

  /** Updates the caller's own profile (#824). */
  async updateMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }

    const user = await userService.updateProfile(req.userId, parsed.data);
    res.status(200).json(user);
  },

  /** Deletes the caller's own account (#824). */
  async deleteMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    await userService.deleteAccount(req.userId);
    res.status(204).send();
  }
};
