import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { LIMITS } from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import type { AuthUser } from "../common/auth-types";
import { CurrentUser, OptionalUser, Public, RateLimit } from "../common/decorators";
import { PaginationQuery } from "../common/utils/pagination";
import { isReferenceFormat } from "../common/utils/reference";
import { CommentsService } from "./comments.service";

class CommentBodyDto {
  @IsString()
  @MaxLength(LIMITS.comment.max, {
    message: `Comments can be at most ${LIMITS.comment.max} characters.`
  })
  body!: string;
}

class CreateCommentDto extends CommentBodyDto {
  /** Post as a Sidewalk staff update. Staff only. */
  @IsOptional()
  @IsBoolean()
  asStaff?: boolean;
}

const ref = (reference: string) => {
  const upper = reference.toUpperCase();
  if (!isReferenceFormat(upper)) throw AppError.notFound("We could not find that report.");
  return upper;
};

@ApiTags("Comments")
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Public()
  @Get("reports/:reference/comments")
  list(
    @Param("reference") reference: string,
    @Query() query: PaginationQuery,
    @OptionalUser() viewer: AuthUser | undefined
  ) {
    return this.comments.list(ref(reference), viewer, query.page, Math.min(query.pageSize, 50));
  }

  @ApiCookieAuth()
  @RateLimit(20, 600)
  @Post("reports/:reference/comments")
  create(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Body() dto: CreateCommentDto
  ) {
    return this.comments.create(user, ref(reference), dto.body, dto.asStaff ?? false);
  }

  @ApiCookieAuth()
  @Patch("comments/:id")
  edit(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CommentBodyDto
  ) {
    return this.comments.edit(user, id, dto.body);
  }

  @ApiCookieAuth()
  @HttpCode(204)
  @Delete("comments/:id")
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.comments.remove(user, id);
  }
}
