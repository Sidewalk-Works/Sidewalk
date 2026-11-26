import { Module, RequestMethod } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { ActivityModule } from "./activity/activity.module";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { AuthGuard } from "./common/guards/auth.guard";
import { CsrfGuard } from "./common/guards/csrf.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { buildPinoHttpOptions } from "./common/logging";
import { CommentsModule } from "./comments/comments.module";
import { APP_ENV, type AppEnv } from "./config/env";
import { EnvModule } from "./config/env.module";
import { EmailModule } from "./email/email.module";
import { EvidenceModule } from "./evidence/evidence.module";
import { HealthModule } from "./health/health.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { LocationsModule } from "./locations/locations.module";
import { ModerationModule } from "./moderation/moderation.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RateLimitGuard } from "./ratelimit/rate-limit.guard";
import { RateLimitModule } from "./ratelimit/rate-limit.module";
import { ReportsModule } from "./reports/reports.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    EnvModule,
    LoggerModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        forRoutes: [{ path: "{*path}", method: RequestMethod.ALL }],
        pinoHttp: buildPinoHttpOptions(env)
      })
    }),
    PrismaModule,
    RateLimitModule,
    AuditModule,
    EmailModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ActivityModule,
    EvidenceModule,
    LocationsModule,
    NotificationsModule,
    OrganizationsModule,
    ReportsModule,
    CommentsModule,
    ModerationModule,
    AdminModule,
    HealthModule
  ],
  providers: [
    // Order matters: authenticate first so the throttler can key on the user, then CSRF, then roles.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter }
  ]
})
export class AppModule {}
