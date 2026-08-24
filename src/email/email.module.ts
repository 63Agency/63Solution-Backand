import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { BulkMailerService } from './bulk-mailer.service';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

/**
 * Bulk marketing email only.
 * Does NOT import MailerService — meetings keep SMTP_* via common/mailer.
 */
@Module({
  imports: [SupabaseModule],
  controllers: [EmailController],
  providers: [EmailService, BulkMailerService],
  exports: [EmailService],
})
export class EmailModule {}
