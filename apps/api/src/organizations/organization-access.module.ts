import { Module } from "@nestjs/common";
import { OrganizationAccessService } from "./organization-access.service";

/** Just the authorization checks, so evidence and reports can use them without depending on the whole organizations module. */
@Module({ providers: [OrganizationAccessService], exports: [OrganizationAccessService] })
export class OrganizationAccessModule {}
