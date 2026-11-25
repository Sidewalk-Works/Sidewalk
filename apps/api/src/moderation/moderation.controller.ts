import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { AppError } from "../common/app-error";
import type { AuthUser } from "../common/auth-types";
import { CurrentUser, RateLimit, Roles } from "../common/decorators";
import { PaginationQuery } from "../common/utils/pagination";
import { isReferenceFormat } from "../common/utils/reference";
import {
  ContentListQuery,
  CreateFlagDto,
  DismissFlagDto,
  FlagListQuery,
  ModerationActionDto,
  NoteDto
} from "./dto";
import { ModerationService } from "./moderation.service";

const ref = (reference: string) => {
  const upper = reference.toUpperCase();
  if (!isReferenceFormat(upper)) throw AppError.notFound("We could not find that report.");
  return upper;
};

@ApiTags("Moderation")
@ApiCookieAuth()
@Controller()
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  // Any signed-in citizen may flag content.
  @RateLimit(20, 3600)
  @HttpCode(204)
  @Post("reports/:reference/flags")
  async flagReport(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Body() dto: CreateFlagDto
  ): Promise<void> {
    await this.moderation.flagReport(user, ref(reference), dto);
  }

  @RateLimit(20, 3600)
  @HttpCode(204)
  @Post("comments/:id/flags")
  async flagComment(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateFlagDto
  ): Promise<void> {
    await this.moderation.flagComment(user, id, dto);
  }

  @RateLimit(20, 3600)
  @HttpCode(204)
  @Post("official-responses/:id/flags")
  async flagResponse(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateFlagDto
  ): Promise<void> {
    await this.moderation.flagResponse(user, id, dto);
  }

  // Everything below is staff only: guard here, re-checked inside the service.
  @Roles("MODERATOR", "ADMIN")
  @Get("moderation/flags")
  flags(@CurrentUser() user: AuthUser, @Query() query: FlagListQuery) {
    return this.moderation.listFlags(user, query);
  }

  @Roles("MODERATOR", "ADMIN")
  @Get("moderation/reports")
  reports(@CurrentUser() user: AuthUser, @Query() query: ContentListQuery) {
    return this.moderation.listReports(user, query);
  }

  @Roles("MODERATOR", "ADMIN")
  @Get("moderation/comments")
  comments(@CurrentUser() user: AuthUser, @Query() query: ContentListQuery) {
    return this.moderation.listComments(user, query);
  }

  @Roles("MODERATOR", "ADMIN")
  @Get("moderation/actions")
  history(@CurrentUser() user: AuthUser, @Query() query: PaginationQuery) {
    return this.moderation.history(user, query.page, query.pageSize);
  }

  @Roles("MODERATOR", "ADMIN")
  @HttpCode(200)
  @Post("moderation/reports/:reference/actions")
  actOnReport(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Body() dto: ModerationActionDto
  ) {
    return this.moderation.actOnReport(user, ref(reference), dto);
  }

  @Roles("MODERATOR", "ADMIN")
  @HttpCode(200)
  @Post("moderation/comments/:id/actions")
  actOnComment(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ModerationActionDto
  ) {
    return this.moderation.actOnComment(user, id, dto);
  }

  @Roles("MODERATOR", "ADMIN")
  @HttpCode(200)
  @Post("moderation/official-responses/:id/actions")
  actOnResponse(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ModerationActionDto
  ) {
    return this.moderation.actOnResponse(user, id, dto);
  }

  @Roles("MODERATOR", "ADMIN")
  @HttpCode(204)
  @Post("moderation/flags/:id/dismiss")
  async dismiss(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DismissFlagDto
  ): Promise<void> {
    await this.moderation.dismissFlag(user, id, dto.reason);
  }

  @Roles("MODERATOR", "ADMIN")
  @Get("moderation/reports/:reference/context")
  context(@CurrentUser() user: AuthUser, @Param("reference") reference: string) {
    return this.moderation.context(user, ref(reference));
  }

  @Roles("MODERATOR", "ADMIN")
  @Get("moderation/reports/:reference/notes")
  async notes(@CurrentUser() user: AuthUser, @Param("reference") reference: string) {
    return { items: await this.moderation.notes(user, ref(reference)) };
  }

  @Roles("MODERATOR", "ADMIN")
  @Post("moderation/reports/:reference/notes")
  addNote(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Body() dto: NoteDto
  ) {
    return this.moderation.addNote(user, ref(reference), dto.body);
  }
}
