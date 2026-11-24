import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { BrevoWebhookService } from './brevo-webhook.service';
import { BulkMailerService } from './bulk-mailer.service';
import { EmailController } from './email.controller';
import { EmailPublicController } from './email-public.controller';
import { EmailService } from './email.service';
import { UnsubscribeService } from './unsubscribe.service';

/**
 * Bulk marketing email only.
 * Does NOT import MailerService — meetings keep SMTP_* via common/mailer.
 */
@Module({
  imports: [SupabaseModule],
  controllers: [EmailController, EmailPublicController],
  providers: [
    EmailService,
    BulkMailerService,
    UnsubscribeService,
    BrevoWebhookService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
