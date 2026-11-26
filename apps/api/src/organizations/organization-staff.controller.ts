import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AppError } from "../common/app-error";
import type { AuthUser } from "../common/auth-types";
import { CurrentUser, RateLimit, Roles } from "../common/decorators";
import { isReferenceFormat } from "../common/utils/reference";
import {
  ApplicationQueueQuery,
  CreateOrganizationDto,
  DecisionDto,
  GovernanceReasonDto,
  InfoRequestDto,
  RelationQueueQuery,
  ResponseListQuery,
  ReviewerNotesDto,
  StaffOrganizationListQuery,
  StaffRelationDto
} from "./dto";
import { GovernanceService } from "./governance.service";
import { OfficialResponsesReader } from "./official-responses.reader";
import { OfficialResponsesService } from "./official-responses.service";

function parseReference(reference: string): string {
  const normalized = reference.toUpperCase();
  if (!isReferenceFormat(normalized)) throw AppError.notFound("We could not find that report.");
  return normalized;
}

/**
 * What Sidewalk staff (moderators and administrators) can see and do about organizations. Moderators read, start
 * reviews, ask questions and keep private notes; the decisions themselves are administrator-only and enforced in the
 * service, not just here.
 */
@ApiTags("Organization governance")
@ApiCookieAuth()
@Roles("MODERATOR", "ADMIN")
@Controller("moderation")
export class OrganizationModerationController {
  constructor(
    private readonly governance: GovernanceService,
    private readonly responses: OfficialResponsesService,
    private readonly reader: OfficialResponsesReader
  ) {}

  @Get("organization-applications")
  queue(@CurrentUser() user: AuthUser, @Query() query: ApplicationQueueQuery) {
    return this.governance.queue(user, query);
  }

  @Get("organization-applications/:id")
  application(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.governance.getApplication(user, id);
  }

  @RateLimit(60, 600)
  @HttpCode(204)
  @Post("organization-applications/:id/start-review")
  async startReview(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.governance.startReview(user, id);
  }

  @RateLimit(60, 600)
  @HttpCode(204)
  @Post("organization-applications/:id/request-info")
  async requestInfo(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: InfoRequestDto
  ): Promise<void> {
    await this.governance.requestInfo(user, id, dto.message);
  }

  @RateLimit(60, 600)
  @HttpCode(204)
  @Post("organization-applications/:id/notes")
  async notes(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewerNotesDto
  ): Promise<void> {
    await this.governance.saveNotes(user, id, dto.notes);
  }

  @Get("organizations")
  organizations(@CurrentUser() user: AuthUser, @Query() query: StaffOrganizationListQuery) {
    return this.governance.listOrganizations(user, query);
  }

  @Get("organizations/:id")
  organization(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.governance.getOrganization(user, id);
  }

  @Get("organization-relations")
  @ApiOperation({
    summary:
      "Reports where an organization says it is outside its remit, or one was only suggested."
  })
  relations(@CurrentUser() user: AuthUser, @Query() query: RelationQueueQuery) {
    return this.governance.relationQueue(user, query);
  }

  @RateLimit(60, 600)
  @HttpCode(204)
  @Post("reports/:reference/organizations")
  @ApiOperation({
    summary:
      "Connect an organization to a report, or remove the connection (reason recorded in the audit log)."
  })
  async setRelation(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Body() dto: StaffRelationDto
  ): Promise<void> {
    await this.responses.staffSetRelation(user, parseReference(reference), dto);
  }

  @Get("official-responses")
  officialResponses(@CurrentUser() user: AuthUser, @Query() query: ResponseListQuery) {
    return this.reader.listForStaff(user, query);
  }
}

/** Decisions about an organization's standing. Administrators only: guard and service both check. */
@ApiTags("Organization governance")
@ApiCookieAuth()
@Roles("ADMIN")
@Controller("admin/organizations")
export class OrganizationAdminController {
  constructor(private readonly governance: GovernanceService) {}

  @RateLimit(30, 3600)
  @Post()
  @ApiOperation({
    summary: "Create an unverified organization record, optionally inviting its representative."
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrganizationDto) {
    return this.governance.createOrganization(user, dto);
  }

  @RateLimit(60, 3600)
  @HttpCode(204)
  @Post("applications/:id/decision")
  @ApiOperation({
    summary:
      "Approve or reject an application. Approval is the only way an organization becomes verified."
  })
  async decide(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto
  ): Promise<void> {
    await this.governance.decide(user, id, dto);
  }

  @RateLimit(30, 3600)
  @HttpCode(204)
  @Post(":id/suspend")
  async suspend(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GovernanceReasonDto
  ): Promise<void> {
    await this.governance.suspend(user, id, dto.reason);
  }

  @RateLimit(30, 3600)
  @HttpCode(204)
  @Post(":id/reinstate")
  async reinstate(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GovernanceReasonDto
  ): Promise<void> {
    await this.governance.reinstate(user, id, dto.reason);
  }

  @RateLimit(30, 3600)
  @HttpCode(204)
  @Post(":id/revoke-verification")
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GovernanceReasonDto
  ): Promise<void> {
    await this.governance.revokeVerification(user, id, dto.reason);
  }
}
