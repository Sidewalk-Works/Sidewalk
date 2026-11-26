import { Module } from "@nestjs/common";
import { OrganizationAccessModule } from "../organizations/organization-access.module";
import { ModerationController } from "./moderation.controller";
import { ModerationService } from "./moderation.service";

@Module({
  imports: [OrganizationAccessModule],
  controllers: [ModerationController],
  providers: [ModerationService]
})
export class ModerationModule {}
