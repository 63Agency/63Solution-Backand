import { Module } from '@nestjs/common';
import { MailerService } from '../common/mailer/mailer.service';
import { ClientsModule } from '../clients/clients.module';
import { FacturesModule } from '../factures/factures.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { DevisController } from './devis.controller';
import { DevisService } from './devis.service';

@Module({
  imports: [SupabaseModule, ClientsModule, FacturesModule],
  controllers: [DevisController],
  providers: [DevisService, MailerService],
  exports: [DevisService],
})
export class DevisModule {}
