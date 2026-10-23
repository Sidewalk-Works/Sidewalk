import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { internalClientIp } from "./common/client-ip";
import { createValidationPipe } from "./common/validation";
import { APP_ENV, type AppEnv } from "./config/env";

export const API_PREFIX = "api/v1";

/** Shared by main.ts and the integration tests so tests exercise the real HTTP configuration. */
export function configureApp(app: INestApplication): void {
  const env = app.get<AppEnv>(APP_ENV);
  const express = app as NestExpressApplication;

  express.set(
    "trust proxy",
    env.TRUST_PROXY === "true"
      ? 1
      : env.TRUST_PROXY === "false"
        ? false
        : Number(env.TRUST_PROXY) || env.TRUST_PROXY
  );
  express.disable("x-powered-by");
  express.useBodyParser("json", { limit: "100kb" });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app.use(internalClientIp(env.INTERNAL_PROXY_SECRET));
  app.use(
    helmet({
      contentSecurityPolicy: env.isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: "same-site" }
    })
  );
  app.use(cookieParser());
  // Responses depend on who is asking (cookies), so nothing is shared-cacheable unless a route opts in
  // (evidence images do, briefly, with their own header).
  app.use(
    (
      _req: unknown,
      res: { setHeader(n: string, v: string): void; vary(f: string): void },
      next: () => void
    ) => {
      res.setHeader("Cache-Control", "no-store");
      res.vary("Cookie");
      next();
    }
  );
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"]
  });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle("Sidewalk API")
      .setDescription(
        "Civic accountability API. Authentication uses HttpOnly cookies set by /auth/login; unsafe requests made with cookies must echo the sw_csrf cookie in an X-CSRF-Token header."
      )
      .setVersion("0.1.0")
      .addCookieAuth("sw_at")
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config), {
      jsonDocumentUrl: "api/docs-json"
    });
  }
}
