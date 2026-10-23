import { Module } from "@nestjs/common";
import { AccountService } from "./account.service";
import { AuthTokensService } from "./auth-tokens.service";
import { AuthController } from "./auth.controller";
import { LoginBrake } from "./login-brake.service";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, AuthTokensService, AccountService, LoginBrake],
  exports: [AuthService, PasswordService, AuthTokensService]
})
export class AuthModule {}
