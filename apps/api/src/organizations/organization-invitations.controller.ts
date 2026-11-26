import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../common/auth-types";
import { CurrentUser, Public, RateLimit } from "../common/decorators";
import { InvitationTokenDto } from "./dto";
import { InvitationsService } from "./invitations.service";

/** Acting on an invitation link. The token is in the request body, never in a URL. */
@ApiTags("Organizations")
@Controller("organization-invitations")
export class OrganizationInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @RateLimit(30, 3600)
  @HttpCode(200)
  @Post("check")
  @ApiOperation({ summary: "What does this invitation link offer? Does not use it up." })
  check(@Body() dto: InvitationTokenDto) {
    return this.invitations.inspect(dto.token);
  }

  @ApiCookieAuth()
  @RateLimit(20, 3600)
  @HttpCode(200)
  @Post("accept")
  @ApiOperation({
    summary: "Accept an invitation. Requires being signed in as the invited, confirmed address."
  })
  accept(@CurrentUser() user: AuthUser, @Body() dto: InvitationTokenDto) {
    return this.invitations.accept(user, dto.token);
  }

  @ApiCookieAuth()
  @RateLimit(20, 3600)
  @HttpCode(204)
  @Post("decline")
  async decline(@CurrentUser() user: AuthUser, @Body() dto: InvitationTokenDto): Promise<void> {
    await this.invitations.decline(user, dto.token);
  }
}
