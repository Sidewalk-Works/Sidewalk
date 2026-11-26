import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from "@nestjs/common";
import { APP_ENV, type AppEnv } from "../config/env";
import { OutboxService } from "./outbox.service";

/**
 * The delivery worker. It polls the outbox, so a committed event is never lost: if the process dies, the row is
 * still there and is picked up by the next run (or by another instance, since rows are claimed with SKIP LOCKED).
 *
 * Lifecycle: started when the application boots (when OUTBOX_WORKER_ENABLED is true), it loops until shutdown.
 * On SIGTERM the loop stops taking new work and waits for the message in flight, so nothing is half-sent.
 * `pnpm worker` runs the same code as a standalone process.
 */
@Injectable()
export class OutboxProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("OutboxWorker");
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private inflight: Promise<unknown> = Promise.resolve();
  private lastCleanup = 0;

  constructor(
    private readonly outbox: OutboxService,
    @Inject(APP_ENV) private readonly env: AppEnv
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.OUTBOX_WORKER_ENABLED) this.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.log(`Delivery worker started (polling every ${this.env.OUTBOX_POLL_MS} ms)`);
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    await this.inflight;
  }

  /** One pass: deliver what is due. Exposed so tests and tools can drive the worker deterministically. */
  async runOnce(): Promise<number> {
    const pass = this.outbox.deliverDue();
    this.inflight = pass.catch(() => undefined);
    return pass;
  }

  private schedule(delay: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.loop(), delay);
  }

  private async loop(): Promise<void> {
    let handled = 0;
    try {
      handled = await this.runOnce();
      if (Date.now() - this.lastCleanup > 3_600_000) {
        this.lastCleanup = Date.now();
        await this.outbox.cleanup();
      }
    } catch (e) {
      this.logger.error(`Delivery pass failed: ${(e as Error).name}`);
    }
    // More work waiting? Go again straight away. Otherwise sleep.
    this.schedule(handled > 0 ? 0 : this.env.OUTBOX_POLL_MS);
  }
}
