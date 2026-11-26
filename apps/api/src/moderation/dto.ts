import { Type } from "class-transformer";
import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from "class-validator";
import {
  FLAG_REASONS,
  LIMITS,
  MODERATION_POLICIES,
  type FlagReason,
  type ModerationPolicy
} from "@sidewalk/contracts";
import { PaginationQuery } from "../common/utils/pagination";

export class CreateFlagDto {
  @IsIn(FLAG_REASONS, { message: "Choose a reason." })
  reason!: FlagReason;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.flagDetails.max)
  details?: string;
}

export class ModerationActionDto {
  @IsIn(["HIDE", "REMOVE", "RESTORE"], { message: "Choose hide, remove or restore." })
  action!: "HIDE" | "REMOVE" | "RESTORE";

  @IsIn(MODERATION_POLICIES, { message: "Choose the policy this decision is based on." })
  policy!: ModerationPolicy;

  /** Recorded permanently in the moderation history. Shown to the author of hidden content. */
  @IsString()
  @Length(LIMITS.moderationReason.min, LIMITS.moderationReason.max, {
    message: `Explain the decision in ${LIMITS.moderationReason.min} to ${LIMITS.moderationReason.max} characters.`
  })
  reason!: string;
}

export class DismissFlagDto {
  @IsString()
  @Length(LIMITS.moderationReason.min, LIMITS.moderationReason.max, {
    message: `Explain why in ${LIMITS.moderationReason.min} to ${LIMITS.moderationReason.max} characters.`
  })
  reason!: string;
}

export class NoteDto {
  @IsString()
  @Length(2, 2000)
  body!: string;
}

export class FlagListQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(["OPEN", "ACTIONED", "DISMISSED", "ALL"])
  status: "OPEN" | "ACTIONED" | "DISMISSED" | "ALL" = "OPEN";
}

export class ContentListQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(["ALL", "VISIBLE", "HIDDEN", "REMOVED"])
  state: "ALL" | "VISIBLE" | "HIDDEN" | "REMOVED" = "ALL";

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class IdParam {
  @Type(() => String)
  @IsUUID()
  id!: string;
}
