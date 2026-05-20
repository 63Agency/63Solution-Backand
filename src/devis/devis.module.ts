import { Module } from '@nestjs/common';
import { MailerService } from '../common/mailer/mailer.service';
import { FacturesModule } from '../factures/factures.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { DevisController } from './devis.controller';
import { DevisService } from './devis.service';

@Module({
  imports: [SupabaseModule, FacturesModule],
  controllers: [DevisController],
  providers: [DevisService, MailerService],
  exports: [DevisService],
})
export class DevisModule {}
