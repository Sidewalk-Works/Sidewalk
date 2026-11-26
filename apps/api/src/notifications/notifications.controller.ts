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
import { IsBoolean, IsIn, IsOptional } from "class-validator";
import type { AuthUser } from "../common/auth-types";
import { CurrentUser, RateLimit } from "../common/decorators";
import { PaginationQuery } from "../common/utils/pagination";
import { NotificationsService } from "./notifications.service";

class NotificationListQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(["true", "false"])
  unread: "true" | "false" = "false";
}

class PreferencesDto {
  @IsOptional()
  @IsBoolean()
  reportUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  comments?: boolean;

  @IsOptional()
  @IsBoolean()
  moderation?: boolean;
}

/** Every route here acts on the caller's own notifications only. */
@ApiTags("Notifications")
@ApiCookieAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get("notifications")
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationListQuery) {
    return this.notifications.list(user.id, query.page, query.pageSize, query.unread === "true");
  }

  @Get("notifications/unread-count")
  async unread(@CurrentUser() user: AuthUser) {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @RateLimit(30, 60)
  @HttpCode(200)
  @Post("notifications/read-all")
  async readAll(@CurrentUser() user: AuthUser) {
    return { marked: await this.notifications.markAllRead(user.id) };
  }

  @RateLimit(120, 60)
  @HttpCode(204)
  @Post("notifications/:id/read")
  async read(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.notifications.setRead(user.id, id, true);
  }

  @RateLimit(120, 60)
  @HttpCode(204)
  @Post("notifications/:id/unread")
  async unreadOne(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.notifications.setRead(user.id, id, false);
  }

  @Get("users/me/notification-preferences")
  preferences(@CurrentUser() user: AuthUser) {
    return this.notifications.preferences(user.id);
  }

  @Patch("users/me/notification-preferences")
  update(@CurrentUser() user: AuthUser, @Body() dto: PreferencesDto) {
    return this.notifications.updatePreferences(user.id, dto);
  }
}
