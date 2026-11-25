import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Query
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../common/auth-types";
import { CurrentUser, OptionalUser, Public, RateLimit } from "../common/decorators";
import { PaginationQuery } from "../common/utils/pagination";
import { InviteDto, OrganizationListQuery, RevokeMemberDto, SetMemberRoleDto } from "./dto";
import { InvitationsService } from "./invitations.service";
import { MembersService } from "./members.service";
import { OrganizationsService } from "./organizations.service";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
import { AppError } from "../common/app-error";
const slug = (value: string) => {
  if (!SLUG.test(value)) throw AppError.notFound("We could not find that organization.");
  return value;
};

@ApiTags("Organizations")
@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly members: MembersService,
    private readonly invitations: InvitationsService
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: "Find public institutions. Only listed profiles appear; verified ones say so."
  })
  list(@Query() query: OrganizationListQuery) {
    return this.organizations.list(query);
  }

  @ApiCookieAuth()
  @Get("mine")
  @ApiOperation({ summary: "The organizations you belong to and the applications you have made." })
  mine(@CurrentUser() user: AuthUser) {
    return this.organizations.mine(user);
  }

  @Public()
  @Get(":slug")
  profile(@Param("slug") value: string, @OptionalUser() viewer: AuthUser | undefined) {
    return this.organizations.profile(slug(value), viewer);
  }

  @Public()
  @Get(":slug/reports")
  reports(
    @Param("slug") value: string,
    @Query() query: PaginationQuery,
    @OptionalUser() viewer: AuthUser | undefined
  ) {
    return this.organizations.reports(slug(value), viewer, query.page, query.pageSize);
  }

  @Public()
  @Get(":slug/responses")
  responses(@Param("slug") value: string, @OptionalUser() viewer: AuthUser | undefined) {
    return this.organizations.recentResponses(slug(value), viewer);
  }

  // ───────────────────────────── members ─────────────────────────────

  @ApiCookieAuth()
  @Get(":slug/members")
  listMembers(@CurrentUser() user: AuthUser, @Param("slug") value: string) {
    return this.members.list(user, slug(value));
  }

  @ApiCookieAuth()
  @RateLimit(30, 600)
  @Patch(":slug/members/:memberId")
  setRole(
    @CurrentUser() user: AuthUser,
    @Param("slug") value: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
    @Body() dto: SetMemberRoleDto
  ) {
    return this.members.setRole(user, slug(value), memberId, dto.role);
  }

  @ApiCookieAuth()
  @RateLimit(30, 600)
  @HttpCode(204)
  @Post(":slug/members/:memberId/revoke")
  async revokeMember(
    @CurrentUser() user: AuthUser,
    @Param("slug") value: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
    @Body() dto: RevokeMemberDto
  ): Promise<void> {
    await this.members.revoke(user, slug(value), memberId, dto.reason);
  }

  @ApiCookieAuth()
  @RateLimit(10, 600)
  @HttpCode(204)
  @Post(":slug/leave")
  async leave(@CurrentUser() user: AuthUser, @Param("slug") value: string): Promise<void> {
    await this.members.leave(user, slug(value));
  }

  // ───────────────────────────── invitations ─────────────────────────────

  @ApiCookieAuth()
  @Get(":slug/invitations")
  listInvitations(@CurrentUser() user: AuthUser, @Param("slug") value: string) {
    return this.invitations.list(user, slug(value));
  }

  @ApiCookieAuth()
  @RateLimit(20, 3600)
  @Post(":slug/invitations")
  @ApiOperation({ summary: "Invite someone to join. An invitation does not verify anything." })
  invite(@CurrentUser() user: AuthUser, @Param("slug") value: string, @Body() dto: InviteDto) {
    return this.invitations.invite(user, slug(value), dto);
  }

  @ApiCookieAuth()
  @RateLimit(20, 3600)
  @Post(":slug/invitations/:id/resend")
  resend(
    @CurrentUser() user: AuthUser,
    @Param("slug") value: string,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.invitations.resend(user, slug(value), id);
  }

  @ApiCookieAuth()
  @RateLimit(30, 3600)
  @HttpCode(204)
  @Post(":slug/invitations/:id/revoke")
  async revokeInvitation(
    @CurrentUser() user: AuthUser,
    @Param("slug") value: string,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.invitations.revoke(user, slug(value), id);
  }
}
