import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public, RateLimit, SkipRateLimit } from "../common/decorators";
import { STORAGE, type StorageProvider } from "../evidence/storage/storage.provider";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider
  ) {}

  /** Liveness: the process is up. Does not touch dependencies, so an orchestrator will not restart it for a database blip. */
  @Public()
  @SkipRateLimit()
  @Get()
  live() {
    return { status: "ok", uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: dependencies answer. Return 503 so load balancers stop routing traffic here. */
  @Public()
  @RateLimit(30, 60)
  @Get("ready")
  async ready() {
    const checks = { database: "ok", storage: "ok" } as Record<string, string>;
    await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.catch(() => (checks.database = "unavailable")),
      this.storage.ping().catch(() => (checks.storage = "unavailable"))
    ]);
    const ok = Object.values(checks).every((v) => v === "ok");
    if (!ok) throw new ServiceUnavailableException({ status: "unavailable", checks });
    return { status: "ok", checks };
  }
}
