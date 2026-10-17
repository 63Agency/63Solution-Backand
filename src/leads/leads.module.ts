import { Module } from '@nestjs/common';
import { ClickupModule } from '../clickup/clickup.module';
import { MailAccountsModule } from '../mail-accounts/mail-accounts.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [ClickupModule, SupabaseModule, WhatsappModule, MailAccountsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
