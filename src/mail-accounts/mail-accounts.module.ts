import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { MailAccountsController } from './mail-accounts.controller';
import { MailAccountsService } from './mail-accounts.service';

@Module({
  imports: [SupabaseModule],
  controllers: [MailAccountsController],
  providers: [MailAccountsService],
  exports: [MailAccountsService],
})
export class MailAccountsModule {}
