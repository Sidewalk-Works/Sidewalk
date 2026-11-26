import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadDotenvFile, loadEnv } from "./config/env";

/**
 * Standalone delivery worker: `pnpm worker`. It runs the same outbox processor the API embeds by default.
 * Use it when you run several API instances (set OUTBOX_WORKER_ENABLED=false on them) or want delivery
 * isolated from request handling. Any number of workers may run at once: they claim rows with SKIP LOCKED.
 * SIGTERM / SIGINT stop it cleanly after the message in flight.
 */
async function main(): Promise<void> {
  loadDotenvFile();
  const env = loadEnv();
  const { WorkerModule } = await import("./worker.module");
  const { OutboxProcessor } = await import("./email/outbox.processor");

  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  app.get(OutboxProcessor).start();
  new Logger("Worker").log(
    `Email worker running against ${new URL(env.DATABASE_URL).pathname.slice(1)} via ${env.SMTP_HOST}:${env.SMTP_PORT}. Press Ctrl+C to stop.`
  );
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
