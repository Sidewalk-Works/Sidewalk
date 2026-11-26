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
  Res,
  Req,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { LIMITS } from "@sidewalk/contracts";
import type { AuthUser, AuthedRequest } from "../common/auth-types";
import { CurrentUser, RateLimit } from "../common/decorators";
import { ApplicationsService } from "./applications.service";
import { CreateApplicationDto, DocumentCaptionDto, UpdateApplicationDto } from "./dto";

@ApiTags("Organization applications")
@ApiCookieAuth()
@Controller("organization-applications")
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @RateLimit(10, 3600)
  @Post()
  @ApiOperation({
    summary: "Start an application for organization verification (a draft until sent)."
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApplicationDto) {
    return this.applications.create(user, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.applications.get(user, id);
  }

  @RateLimit(60, 600)
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto
  ) {
    return this.applications.update(user, id, dto);
  }

  @RateLimit(20, 3600)
  @HttpCode(200)
  @Post(":id/submit")
  submit(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.applications.submit(user, id);
  }

  @RateLimit(20, 3600)
  @HttpCode(200)
  @Post(":id/withdraw")
  withdraw(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.applications.withdraw(user, id);
  }

  @RateLimit(30, 3600)
  @Post(":id/documents")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      // One image and a short caption. Anything more is refused before it is buffered.
      limits: {
        fileSize: LIMITS.evidence.maxFileBytes,
        files: 1,
        fields: 2,
        fieldSize: 1024,
        parts: 4
      }
    })
  )
  addDocument(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DocumentCaptionDto,
    @UploadedFile() file: Express.Multer.File | undefined
  ) {
    return this.applications.addDocument(user, id, file, dto.caption);
  }

  @RateLimit(60, 3600)
  @HttpCode(204)
  @Delete(":id/documents/:documentId")
  async removeDocument(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("documentId", ParseUUIDPipe) documentId: string
  ): Promise<void> {
    await this.applications.removeDocument(user, id, documentId);
  }
}

/** Private documents are only ever served here, to the applicant and Sidewalk staff, and never cached. */
@ApiTags("Organization applications")
@ApiCookieAuth()
@Controller("organization-documents")
export class OrganizationDocumentsController {
  constructor(private readonly applications: ApplicationsService) {}

  @RateLimit(120, 600)
  @Get(":id/file")
  async file(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
    @Res() res: Response
  ): Promise<void> {
    const file = await this.applications.readDocument(user, id);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("ETag", file.etag);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", "inline");
    if (req.headers["if-none-match"] === file.etag) {
      res.status(304).end();
      return;
    }
    res.end(file.body);
  }
}
