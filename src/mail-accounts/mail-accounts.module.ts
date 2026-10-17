import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ImapMailboxService } from './imap-mailbox.service';
import { MailAccountsController } from './mail-accounts.controller';
import { MailAccountsService } from './mail-accounts.service';
import { MailboxController } from './mailbox.controller';
import { UserMailerService } from './user-mailer.service';

@Module({
  imports: [SupabaseModule],
  controllers: [MailAccountsController, MailboxController],
  providers: [MailAccountsService, UserMailerService, ImapMailboxService],
  exports: [MailAccountsService, UserMailerService, ImapMailboxService],
})
export class MailAccountsModule {}
