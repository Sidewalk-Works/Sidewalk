import { Transform } from "class-transformer";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength
} from "class-validator";
import { LIMITS } from "@sidewalk/contracts";

export class RegisterDto {
  /** Email address used to sign in. Never shown publicly. */
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254)
  email!: string;

  /** Name shown publicly on comments, and on reports when the author chooses to be named. */
  @IsString()
  @Length(LIMITS.displayName.min, LIMITS.displayName.max, {
    message: `Your name must be ${LIMITS.displayName.min} to ${LIMITS.displayName.max} characters.`
  })
  displayName!: string;

  @IsString()
  @MinLength(LIMITS.password.min, {
    message: `Your password must be at least ${LIMITS.password.min} characters.`
  })
  @MaxLength(LIMITS.password.max)
  password!: string;
}

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty({ message: "Enter your password." })
  @MaxLength(LIMITS.password.max)
  password!: string;
}

export class EmailOnlyDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254)
  email!: string;
}

export class OptionalEmailDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254)
  email?: string;
}

export class TokenDto {
  /** The one-time token from the emailed link. */
  @IsString()
  @MaxLength(200)
  token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @MinLength(LIMITS.password.min, {
    message: `Your password must be at least ${LIMITS.password.min} characters.`
  })
  @MaxLength(LIMITS.password.max)
  password!: string;
}
