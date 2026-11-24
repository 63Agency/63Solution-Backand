import { Module } from '@nestjs/common';
import { MailerService } from '../common/mailer/mailer.service';
import { EmailTrackingModule } from '../email/email-tracking.module';
import { FacturesModule } from '../factures/factures.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { DevisController } from './devis.controller';
import { DevisService } from './devis.service';

@Module({
  imports: [SupabaseModule, FacturesModule, EmailTrackingModule],
  controllers: [DevisController],
  providers: [DevisService, MailerService],
  exports: [DevisService],
})
export class DevisModule {}
