import { Module } from '@nestjs/common';
import { MailerService } from '../common/mailer/mailer.service';
import { EmailTrackingModule } from '../email/email-tracking.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PropositionsController } from './propositions.controller';
import { PropositionsService } from './propositions.service';

@Module({
  imports: [SupabaseModule, EmailTrackingModule],
  controllers: [PropositionsController],
  providers: [PropositionsService, MailerService],
  exports: [PropositionsService],
})
export class PropositionsModule {}
