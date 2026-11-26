import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { UserDto } from "@sidewalk/contracts";
import { APP_ENV, type AppEnv } from "../config/env";
import type { AuthedRequest, AuthUser } from "../common/auth-types";
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from "../common/cookies";
import { CurrentUser, OptionalUser, Public, RateLimit } from "../common/decorators";
import { AccountService } from "./account.service";
import { AuthService, type SessionUser } from "./auth.service";
import {
  LoginDto,
  OptionalEmailDto,
  EmailOnlyDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto
} from "./dto";
import { PrismaService } from "../prisma/prisma.service";
import { AppError } from "../common/app-error";

export const toUserDto = (u: SessionUser): UserDto => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  emailVerified: u.emailVerifiedAt !== null,
  createdAt: u.createdAt.toISOString()
});

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly account: AccountService,
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv
  ) {}

  @Public()
  @RateLimit(5, 3600)
  @HttpCode(202)
  @Post("register")
  @ApiOperation({
    summary:
      "Create an account. Always answers the same way; a confirmation email follows. Does not sign in."
  })
  async register(@Body() dto: RegisterDto) {
    await this.account.register(dto);
    return { status: "check_email" };
  }

  @Public()
  @RateLimit(5, 3600)
  @HttpCode(202)
  @Post("verification/resend")
  @ApiOperation({ summary: "Send a new confirmation link. Neutral for any address." })
  async resendVerification(
    @Body() dto: OptionalEmailDto,
    @OptionalUser() current: AuthUser | undefined
  ) {
    const outcome = await this.account.resendVerification(dto.email, current);
    // Only a signed-in user asking about their own account is told more, so nothing about other people leaks.
    return current && (!dto.email || dto.email.toLowerCase() === current.email)
      ? { status: outcome }
      : { status: "check_email" };
  }

  @Public()
  @RateLimit(20, 3600)
  @HttpCode(200)
  @Post("verification/confirm")
  @ApiOperation({
    summary: "Confirm an email address with the one-time token from the emailed link."
  })
  async confirmEmail(@Body() dto: TokenDto) {
    await this.account.confirmEmail(dto.token);
    return { status: "verified" };
  }

  @Public()
  @RateLimit(5, 3600)
  @HttpCode(202)
  @Post("password/forgot")
  @ApiOperation({ summary: "Request a password-reset email. Neutral for any address." })
  async forgotPassword(@Body() dto: EmailOnlyDto) {
    await this.account.requestPasswordReset(dto.email);
    return { status: "check_email" };
  }

  @Public()
  @RateLimit(30, 3600)
  @HttpCode(200)
  @Post("password/reset/check")
  @ApiOperation({ summary: "Is this reset token still usable? Does not use it up." })
  checkReset(@Body() dto: TokenDto) {
    return this.account.checkResetToken(dto.token);
  }

  @Public()
  @RateLimit(10, 3600)
  @HttpCode(200)
  @Post("password/reset")
  @ApiOperation({
    summary: "Set a new password with a reset token. Signs out every device. Does not sign in."
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.account.resetPassword(dto.token, dto.password);
    return { status: "password_changed" };
  }

  @Public()
  @RateLimit(10, 60)
  @HttpCode(200)
  @Post("login")
  @ApiOperation({ summary: "Sign in with email and password (sets HttpOnly cookies)." })
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    const { user, tokens } = await this.auth.login(dto, req.headers["user-agent"], req.ip);
    setAuthCookies(res, this.env, tokens);
    return { user: toUserDto(user) };
  }

  @Public()
  @RateLimit(60, 60)
  @HttpCode(200)
  @Post("refresh")
  @ApiOperation({
    summary: "Rotate the refresh cookie and issue a fresh short-lived access cookie."
  })
  async refresh(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    try {
      const { user, tokens } = await this.auth.refresh(raw, req.headers["user-agent"]);
      setAuthCookies(res, this.env, tokens);
      return { user: toUserDto(user) };
    } catch (e) {
      clearAuthCookies(res, this.env);
      throw e;
    }
  }

  @Public()
  @HttpCode(204)
  @Post("logout")
  @ApiOperation({ summary: "Revoke the current session and clear cookies." })
  async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    await this.auth.logout((req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE]);
    clearAuthCookies(res, this.env);
  }

  @ApiCookieAuth()
  @Get("me")
  @ApiOperation({ summary: "The signed-in user." })
  async me(@CurrentUser() current: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: current.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true
      }
    });
    if (!user) throw AppError.unauthorized();
    const unreadNotifications = await this.prisma.notification.count({
      where: { userId: current.id, readAt: null }
    });
    return { user: toUserDto(user), unreadNotifications };
  }
}
