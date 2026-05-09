import { Module } from '@nestjs/common';
import { MailerService } from '../common/mailer/mailer.service';
import { ClientsModule } from '../clients/clients.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { FacturesController } from './factures.controller';
import { FacturesService } from './factures.service';

@Module({
  imports: [SupabaseModule, ClientsModule],
  controllers: [FacturesController],
  providers: [FacturesService, MailerService],
  exports: [FacturesService],
})
export class FacturesModule {}
