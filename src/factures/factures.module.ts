import { Module } from '@nestjs/common';
import { MailerService } from '../common/mailer/mailer.service';
import { EmailTrackingModule } from '../email/email-tracking.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { FacturesController } from './factures.controller';
import { FacturesService } from './factures.service';

@Module({
  imports: [SupabaseModule, EmailTrackingModule],
  controllers: [FacturesController],
  providers: [FacturesService, MailerService],
  exports: [FacturesService],
})
export class FacturesModule {}
