import { IsString, Length, MaxLength, MinLength } from "class-validator";
import { LIMITS } from "@sidewalk/contracts";

export class UpdateProfileDto {
  @IsString()
  @Length(LIMITS.displayName.min, LIMITS.displayName.max, {
    message: `Your name must be ${LIMITS.displayName.min} to ${LIMITS.displayName.max} characters.`
  })
  displayName!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(LIMITS.password.max)
  currentPassword!: string;

  @IsString()
  @MinLength(LIMITS.password.min, {
    message: `Your new password must be at least ${LIMITS.password.min} characters.`
  })
  @MaxLength(LIMITS.password.max)
  newPassword!: string;
}

export class DeleteAccountDto {
  @IsString()
  @MaxLength(LIMITS.password.max)
  password!: string;
}
