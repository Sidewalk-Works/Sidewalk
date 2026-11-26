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
  Req,
  Res
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { createHash } from "node:crypto";
import { Inject } from "@nestjs/common";
import type { Response } from "express";
import { APP_ENV, type AppEnv } from "../config/env";
import type { AuthedRequest, AuthUser } from "../common/auth-types";
import { clearAuthCookies, REFRESH_COOKIE } from "../common/cookies";
import { CurrentUser, RateLimit } from "../common/decorators";
import { ChangePasswordDto, DeleteAccountDto, UpdateProfileDto } from "./dto";
import { UsersService } from "./users.service";
import { toUserDto } from "../auth/auth.controller";

const currentHash = (req: AuthedRequest): string | undefined => {
  const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  return raw ? createHash("sha256").update(raw).digest("hex") : undefined;
};

@ApiTags("Account")
@ApiCookieAuth()
@Controller("users/me")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    @Inject(APP_ENV) private readonly env: AppEnv
  ) {}

  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return { user: toUserDto(await this.users.updateProfile(user.id, dto)) };
  }

  @RateLimit(5, 600)
  @HttpCode(204)
  @Post("password")
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthedRequest
  ): Promise<void> {
    await this.users.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      currentHash(req)
    );
  }

  @Get("sessions")
  async sessions(@CurrentUser() user: AuthUser, @Req() req: AuthedRequest) {
    return { items: await this.users.listSessions(user.id, currentHash(req)) };
  }

  @HttpCode(204)
  @Delete("sessions")
  async revokeOthers(@CurrentUser() user: AuthUser, @Req() req: AuthedRequest): Promise<void> {
    await this.users.revokeOtherSessions(user.id, currentHash(req));
  }

  @HttpCode(204)
  @Delete("sessions/:id")
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.users.revokeSession(user.id, id);
  }

  @RateLimit(3, 600)
  @HttpCode(204)
  @Delete()
  async remove(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    await this.users.deleteAccount(user.id, dto.password);
    clearAuthCookies(res, this.env);
  }
}
