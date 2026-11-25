import { Module } from "@nestjs/common";
import { ActivityModule } from "../activity/activity.module";
import { EvidenceModule } from "../evidence/evidence.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [ActivityModule, EvidenceModule, OrganizationsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService]
})
export class ReportsModule {}
