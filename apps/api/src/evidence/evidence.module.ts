import { Inject, Logger, Module, OnModuleInit } from "@nestjs/common";
import path from "node:path";
import { APP_ENV, type AppEnv } from "../config/env";
import { EvidenceController } from "./evidence.controller";
import { EvidenceService } from "./evidence.service";
import { LocalStorageProvider } from "./storage/local-storage.provider";
import { S3StorageProvider } from "./storage/s3-storage.provider";
import { STORAGE, type StorageProvider } from "./storage/storage.provider";

@Module({
  controllers: [EvidenceController],
  providers: [
    {
      provide: STORAGE,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): StorageProvider =>
        env.STORAGE_DRIVER === "s3"
          ? new S3StorageProvider(env)
          : new LocalStorageProvider(path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR))
    },
    EvidenceService
  ],
  exports: [EvidenceService, STORAGE]
})
export class EvidenceModule implements OnModuleInit {
  private readonly logger = new Logger(EvidenceModule.name);

  constructor(
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(APP_ENV) private readonly env: AppEnv
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.storage instanceof S3StorageProvider) await this.storage.ensureBucket();
    this.logger.log(`Evidence storage driver: ${this.env.STORAGE_DRIVER}`);
  }
}
