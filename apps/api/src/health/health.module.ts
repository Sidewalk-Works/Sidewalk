import { Module } from "@nestjs/common";
import { EvidenceModule } from "../evidence/evidence.module";
import { HealthController } from "./health.controller";

@Module({ imports: [EvidenceModule], controllers: [HealthController] })
export class HealthModule {}
