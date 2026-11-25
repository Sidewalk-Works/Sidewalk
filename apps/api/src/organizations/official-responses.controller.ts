import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AppError } from "../common/app-error";
import type { AuthUser } from "../common/auth-types";
import { CurrentUser, RateLimit } from "../common/decorators";
import { isReferenceFormat } from "../common/utils/reference";
import { OrganizationSlugDto, PublishResponseDto } from "./dto";
import { OfficialResponsesService } from "./official-responses.service";

function parseReference(reference: string): string {
  const normalized = reference.toUpperCase();
  if (!isReferenceFormat(normalized)) throw AppError.notFound("We could not find that report.");
  return normalized;
}

@ApiTags("Official responses")
@ApiCookieAuth()
@Controller("reports")
export class OfficialResponsesController {
  constructor(private readonly responses: OfficialResponsesService) {}

  @RateLimit(30, 600)
  @Post(":reference/official-responses")
  @ApiOperation({
    summary: "Publish an official response for a verified organization you represent."
  })
  publish(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Body() dto: PublishResponseDto
  ) {
    return this.responses.publish(user, parseReference(reference), dto);
  }

  @RateLimit(30, 600)
  @HttpCode(204)
  @Post(":reference/organizations")
  @ApiOperation({
    summary:
      "Connect an organization to a report: suggest one (reporter), add yours (representative) or assign (staff)."
  })
  async connect(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Body() dto: OrganizationSlugDto
  ): Promise<void> {
    await this.responses.connect(user, parseReference(reference), dto.organizationSlug);
  }
}
