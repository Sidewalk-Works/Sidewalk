import { Router } from "express";

import { requireAuth } from "../../../shared/middleware/requireAuth.js";
import { usersController } from "../controllers/users.controller.js";

export const usersRouter: Router = Router();

usersRouter.get("/me", requireAuth, usersController.me);
usersRouter.put("/me", requireAuth, usersController.updateMe);
usersRouter.delete("/me", requireAuth, usersController.deleteMe);
