import { Module } from "@nestjs/common";
import { ActivityModule } from "../activity/activity.module";
import { EvidenceModule } from "../evidence/evidence.module";
import { ApplicationsController, OrganizationDocumentsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { GovernanceService } from "./governance.service";
import { InvitationsService } from "./invitations.service";
import { MembersService } from "./members.service";
import { OfficialResponsesController } from "./official-responses.controller";
import { OfficialResponsesReader } from "./official-responses.reader";
import { OfficialResponsesService } from "./official-responses.service";
import { OrganizationAccessModule } from "./organization-access.module";
import { OrganizationInvitationsController } from "./organization-invitations.controller";
import { OrganizationNotifier } from "./organization-notifier";
import {
  OrganizationAdminController,
  OrganizationModerationController
} from "./organization-staff.controller";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [OrganizationAccessModule, ActivityModule, EvidenceModule],
  controllers: [
    OrganizationsController,
    OrganizationInvitationsController,
    ApplicationsController,
    OrganizationDocumentsController,
    OfficialResponsesController,
    OrganizationModerationController,
    OrganizationAdminController
  ],
  providers: [
    OrganizationsService,
    ApplicationsService,
    GovernanceService,
    InvitationsService,
    MembersService,
    OfficialResponsesService,
    OfficialResponsesReader,
    OrganizationNotifier
  ],
  exports: [OfficialResponsesReader, OrganizationNotifier, OrganizationAccessModule]
})
export class OrganizationsModule {}
