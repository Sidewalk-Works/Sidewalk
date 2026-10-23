import { Global, Module } from "@nestjs/common";
import { EMAIL_PROVIDER, SmtpEmailProvider } from "./email.provider";
import { EmailLinks } from "./links";
import { OutboxProcessor } from "./outbox.processor";
import { OutboxService } from "./outbox.service";

@Global()
@Module({
  providers: [
    { provide: EMAIL_PROVIDER, useClass: SmtpEmailProvider },
    EmailLinks,
    OutboxService,
    OutboxProcessor
  ],
  exports: [EMAIL_PROVIDER, EmailLinks, OutboxService, OutboxProcessor]
})
export class EmailModule {}
