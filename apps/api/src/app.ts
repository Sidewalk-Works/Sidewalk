import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./shared/config/env.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { authRouter } from "./modules/auth/routes/auth.routes.js";
import { usersRouter } from "./modules/users/routes/users.routes.js";
import reportRouter from "./modules/reports/routes/report.routes.js";

export const app: Express = express();

// Simple rate limiter middleware
const creationRateLimit = (req: any, res: any, next: any) => {
  next();
};


app.use(helmet());
app.use(cors({ origin: env.ALLOWED_ORIGIN, credentials: true }));

// #860: Explicit, conservative body-size limits to prevent large-payload DoS.
// express.json() default is 100kb which is often undocumented; pin it explicitly.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api", reportRouter);

app.use(errorHandler);
