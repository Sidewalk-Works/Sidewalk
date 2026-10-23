import { Controller, Get, Param, ParseUUIDPipe, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import type { Response } from "express";
import type { AuthedRequest } from "../common/auth-types";
import { Public } from "../common/decorators";
import { EvidenceService } from "./evidence.service";

class FileQuery {
  @IsOptional()
  @IsIn(["thumb", "full"])
  variant: "thumb" | "full" = "full";
}

@ApiTags("Evidence")
@Controller("evidence")
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  /** Evidence is always served through this endpoint so visibility rules apply. Object-store URLs are never exposed. */
  @Public()
  @Get(":id/file")
  async file(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: FileQuery,
    @Req() req: AuthedRequest,
    @Res() res: Response
  ): Promise<void> {
    const file = await this.evidence.read(id, query.variant, req.user);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("ETag", file.etag);
    res.setHeader("Cache-Control", file.isPublic ? "public, max-age=300" : "private, no-store");
    res.setHeader("Content-Disposition", "inline");
    if (req.headers["if-none-match"] === file.etag) {
      res.status(304).end();
      return;
    }
    res.end(file.body);
  }
}
