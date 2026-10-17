import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { MailAccountsController } from './mail-accounts.controller';
import { MailAccountsService } from './mail-accounts.service';
import { UserMailerService } from './user-mailer.service';

@Module({
  imports: [SupabaseModule],
  controllers: [MailAccountsController],
  providers: [MailAccountsService, UserMailerService],
  exports: [MailAccountsService, UserMailerService],
})
export class MailAccountsModule {}
