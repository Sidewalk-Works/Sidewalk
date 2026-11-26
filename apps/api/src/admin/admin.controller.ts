import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min
} from "class-validator";
import { Type } from "class-transformer";
import { ROLES, type Role } from "@sidewalk/contracts";
import type { AuthUser } from "../common/auth-types";
import { assertAdmin } from "../common/auth-types";
import { CurrentUser, RateLimit, Roles } from "../common/decorators";
import { PaginationQuery } from "../common/utils/pagination";
import { CategoriesService } from "../categories/categories.service";
import { AdminService } from "./admin.service";

class UserListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

class OutboxQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(["ALL", "PENDING", "SENDING", "SENT", "FAILED", "DEAD", "SKIPPED"])
  status?: string;
}

class AuditQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  entityType?: string;
}

class SetRoleDto {
  @IsIn(ROLES)
  role!: Role;
}

class SetStatusDto {
  @IsIn(["ACTIVE", "SUSPENDED"])
  status!: "ACTIVE" | "SUSPENDED";

  @IsString()
  @Length(10, 300, { message: "Explain the decision in 10 to 300 characters." })
  reason!: string;
}

class CreateCategoryDto {
  @IsString()
  @Length(3, 60, { message: "The name must be 3 to 60 characters." })
  name!: string;

  @IsString()
  @Length(10, 240, { message: "The description must be 10 to 240 characters." })
  description!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @Length(3, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(10, 240)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

@ApiTags("Admin")
@ApiCookieAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly categories: CategoriesService
  ) {}

  @Get("users")
  users(@CurrentUser() user: AuthUser, @Query() query: UserListQuery) {
    return this.admin.listUsers(user, query.q, query.page, query.pageSize);
  }

  @Patch("users/:id/role")
  role(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto
  ) {
    return this.admin.setRole(user, id, dto.role);
  }

  @Patch("users/:id/status")
  status(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto
  ) {
    return this.admin.setStatus(user, id, dto.status, dto.reason);
  }

  @Get("email-outbox")
  emailOutbox(@CurrentUser() user: AuthUser, @Query() query: OutboxQuery) {
    return this.admin.emailOutbox(user, query.status, query.page, query.pageSize);
  }

  @RateLimit(60, 600)
  @HttpCode(204)
  @Post("email-outbox/:id/retry")
  async retryEmail(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.admin.retryEmail(user, id);
  }

  @Get("audit")
  audit(@CurrentUser() user: AuthUser, @Query() query: AuditQuery) {
    return this.admin.audits(user, query.page, query.pageSize, query.entityType);
  }

  @Get("categories")
  async listCategories(@CurrentUser() user: AuthUser) {
    assertAdmin(user);
    return { items: await this.categories.list(true) };
  }

  @Post("categories")
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    assertAdmin(user);
    return this.categories.create(user.id, dto);
  }

  @Patch("categories/:id")
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto
  ) {
    assertAdmin(user);
    return this.categories.update(user.id, id, dto);
  }
}
