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
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { LIMITS } from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import type { AuthUser } from "../common/auth-types";
import { CurrentUser, OptionalUser, Public, RateLimit, Roles } from "../common/decorators";
import { isReferenceFormat } from "../common/utils/reference";
import { EvidenceService } from "../evidence/evidence.service";
import {
  CreateReportDto,
  MyReportsQuery,
  ReportFilterQuery,
  TransitionDto,
  UpdateReportDto,
  UploadEvidenceDto
} from "./dto";
import { ReportsService } from "./reports.service";
import { ActivityService } from "../activity/activity.service";

function parseReference(reference: string): string {
  const normalized = reference.toUpperCase();
  if (!isReferenceFormat(normalized)) throw AppError.notFound("We could not find that report.");
  return normalized;
}

@ApiTags("Reports")
@Controller("reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly evidence: EvidenceService,
    private readonly activity: ActivityService
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Search and filter public reports (paginated)." })
  list(@Query() query: ReportFilterQuery) {
    return this.reports.list(query);
  }

  @Public()
  @Get("map")
  @ApiOperation({ summary: "Report coordinates for the map, capped at 500 points." })
  map(@Query() query: ReportFilterQuery) {
    return this.reports.mapPoints(query);
  }

  @Public()
  @Get("stats")
  @ApiOperation({ summary: "Aggregate counts computed from real reports." })
  stats() {
    return this.reports.stats();
  }

  @ApiCookieAuth()
  @Get("mine")
  @ApiOperation({ summary: "The signed-in citizen's own reports, with actions needed." })
  mine(@CurrentUser() user: AuthUser, @Query() query: MyReportsQuery) {
    return this.reports.mine(user, query);
  }

  @ApiCookieAuth()
  @Get("mine/updates")
  @ApiOperation({ summary: "Recent changes other people made to the citizen's reports." })
  async updates(@CurrentUser() user: AuthUser) {
    return { items: await this.activity.recentForOwner(user.id) };
  }

  @ApiCookieAuth()
  @RateLimit(10, 3600)
  @Post()
  @ApiOperation({ summary: "File a report. Idempotent on clientRequestId." })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReportDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { detail, created } = await this.reports.create(user, dto);
    res.status(created ? 201 : 200);
    return detail;
  }

  @Public()
  @Get(":reference")
  @ApiOperation({
    summary:
      "Public report detail with timeline. Hidden reports are visible only to their owner and staff."
  })
  detail(@Param("reference") reference: string, @OptionalUser() viewer: AuthUser | undefined) {
    return this.reports.getDetail(parseReference(reference), viewer);
  }

  @ApiCookieAuth()
  @Patch(":reference")
  @ApiOperation({ summary: "Edit your own report while it is still editable." })
  update(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Body() dto: UpdateReportDto
  ) {
    return this.reports.update(user, parseReference(reference), dto);
  }

  @ApiCookieAuth()
  @RateLimit(60, 600)
  @Put(":reference/follow")
  @ApiOperation({ summary: "Follow a public report to be notified of updates." })
  followReport(@CurrentUser() user: AuthUser, @Param("reference") reference: string) {
    return this.reports.follow(user, parseReference(reference), true);
  }

  @ApiCookieAuth()
  @RateLimit(60, 600)
  @Delete(":reference/follow")
  @ApiOperation({ summary: "Stop following a report." })
  unfollowReport(@CurrentUser() user: AuthUser, @Param("reference") reference: string) {
    return this.reports.follow(user, parseReference(reference), false);
  }

  @ApiCookieAuth()
  @RateLimit(30, 600)
  @HttpCode(200)
  @Post(":reference/status")
  @ApiOperation({
    summary:
      "Change status. Owners may claim resolution or reopen; staff may use every legal transition."
  })
  transition(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Body() dto: TransitionDto
  ) {
    return this.reports.transition(user, parseReference(reference), dto);
  }

  @ApiCookieAuth()
  @Roles("MODERATOR", "ADMIN")
  @HttpCode(200)
  @Post(":reference/verification")
  @ApiOperation({
    summary: "Verify a claimed resolution (staff only, needs evidence, needs a second reviewer)."
  })
  verify(@CurrentUser() user: AuthUser, @Param("reference") reference: string) {
    return this.reports.verifyResolution(user, parseReference(reference));
  }

  @ApiCookieAuth()
  @RateLimit(40, 600)
  @Post(":reference/evidence")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        kind: { type: "string", enum: ["REPORT", "RESOLUTION"] },
        caption: { type: "string" }
      },
      required: ["file"]
    }
  })
  @UseInterceptors(
    FileInterceptor("file", {
      // One small file and a couple of short text fields. Anything more is refused before it is buffered.
      limits: {
        fileSize: LIMITS.evidence.maxFileBytes,
        files: 1,
        fields: 4,
        fieldSize: 1024,
        parts: 6
      }
    })
  )
  async uploadEvidence(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Body() dto: UploadEvidenceDto,
    @UploadedFile() file: Express.Multer.File | undefined
  ) {
    return this.evidence.upload({
      reference: parseReference(reference),
      user,
      file,
      kind: dto.kind,
      caption: dto.caption
    });
  }

  @ApiCookieAuth()
  @HttpCode(204)
  @Delete(":reference/evidence/:evidenceId")
  async removeEvidence(
    @CurrentUser() user: AuthUser,
    @Param("reference") reference: string,
    @Param("evidenceId", ParseUUIDPipe) evidenceId: string
  ): Promise<void> {
    await this.evidence.remove(parseReference(reference), evidenceId, user);
  }
}
