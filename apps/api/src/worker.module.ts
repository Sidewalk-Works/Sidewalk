import { Module } from "@nestjs/common";
import { EmailModule } from "./email/email.module";
import { EnvModule } from "./config/env.module";
import { PrismaModule } from "./prisma/prisma.module";

/** Just enough of the application to deliver email: configuration, the database and the email module. */
@Module({ imports: [EnvModule, PrismaModule, EmailModule] })
export class WorkerModule {}
