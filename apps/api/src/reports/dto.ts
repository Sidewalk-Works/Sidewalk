import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min
} from "class-validator";
import {
  EVIDENCE_KINDS,
  LIMITS,
  REPORT_STATUSES,
  type EvidenceKind,
  type ReportStatus
} from "@sidewalk/contracts";
import { PaginationQuery } from "../common/utils/pagination";

export class CreateReportDto {
  /** Short, specific summary, for example "Open manhole on Adeola Odeku Street". */
  @IsString()
  @Length(LIMITS.title.min, LIMITS.title.max, {
    message: `The title must be ${LIMITS.title.min} to ${LIMITS.title.max} characters.`
  })
  title!: string;

  @IsString()
  @Length(LIMITS.description.min, LIMITS.description.max, {
    message: `The description must be ${LIMITS.description.min} to ${LIMITS.description.max} characters.`
  })
  description!: string;

  /** Category slug from GET /categories. */
  @IsString()
  @Matches(/^[a-z0-9-]{2,60}$/, { message: "Choose a category." })
  categorySlug!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: "Choose a location on the map." })
  @Min(-90, { message: "Latitude must be between -90 and 90." })
  @Max(90, { message: "Latitude must be between -90 and 90." })
  latitude!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: "Choose a location on the map." })
  @Min(-180, { message: "Longitude must be between -180 and 180." })
  @Max(180, { message: "Longitude must be between -180 and 180." })
  longitude!: number;

  /** Street, landmark or directions that help someone find the spot. */
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.address.max)
  addressText?: string;

  /** Neighbourhood or area name, usually filled from the location search. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  areaName?: string;

  /** Show the reporter's display name on the public report. Off by default. */
  @IsOptional()
  @IsBoolean()
  showReporterName?: boolean;

  /** Client-generated UUID so retries and double submissions create only one report. */
  @IsUUID("4", { message: "Missing request id. Refresh the page and try again." })
  clientRequestId!: string;
}

export class UpdateReportDto {
  @IsOptional()
  @IsString()
  @Length(LIMITS.title.min, LIMITS.title.max)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(LIMITS.description.min, LIMITS.description.max)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{2,60}$/)
  categorySlug?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.address.max)
  addressText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  areaName?: string;

  @IsOptional()
  @IsBoolean()
  showReporterName?: boolean;
}

export class ReportFilterQuery extends PaginationQuery {
  /** Keyword search over title, description, address and reference number. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Comma-separated category slugs. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+(,[a-z0-9-]+){0,9}$/, {
    message: "category must be a comma-separated list of slugs."
  })
  category?: string;

  /** Comma-separated statuses. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z_]+(,[A-Z_]+){0,7}$/, {
    message: "status must be a comma-separated list of statuses."
  })
  status?: string;

  @IsOptional()
  @IsIn(["activity", "newest", "oldest"])
  sort: "activity" | "newest" | "oldest" = "activity";

  /** Viewport filter as minLng,minLat,maxLng,maxLat. */
  @IsOptional()
  @IsString()
  @Matches(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, {
    message: "bbox must be minLng,minLat,maxLng,maxLat."
  })
  bbox?: string;

  /** Centre point as lat,lng. Use with radiusKm. */
  @IsOptional()
  @IsString()
  @Matches(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, { message: "near must be lat,lng." })
  near?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radiusKm?: number;
}

export class MyReportsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(["ALL", ...REPORT_STATUSES, "OPEN", "CLOSED"])
  status: "ALL" | "OPEN" | "CLOSED" | ReportStatus = "ALL";
}

export class TransitionDto {
  @IsIn(REPORT_STATUSES, { message: "Choose a valid status." })
  status!: ReportStatus;

  /** Public explanation. Required when resolving, reopening, rejecting or closing as duplicate. */
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.statusNote.max)
  note?: string;
}

export class UploadEvidenceDto {
  @IsOptional()
  @IsIn(EVIDENCE_KINDS)
  kind: EvidenceKind = "REPORT";

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.caption.max)
  caption?: string;
}
