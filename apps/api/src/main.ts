import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { loadDotenvFile, loadEnv } from "./config/env";

async function main(): Promise<void> {
  loadDotenvFile();
  // Fail fast with a readable message before anything else starts.
  const env = loadEnv();
  const { AppModule } = await import("./app.module");
  const { configureApp, API_PREFIX } = await import("./bootstrap");

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  await app.listen(env.API_PORT, env.API_HOST);
  app
    .get(Logger)
    .log(
      `Sidewalk API listening on http://localhost:${env.API_PORT}/${API_PREFIX} (docs: ${env.SWAGGER_ENABLED ? `/api/docs` : "disabled"})`
    );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
