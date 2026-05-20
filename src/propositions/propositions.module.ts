import { Module } from '@nestjs/common';
import { MailerService } from '../common/mailer/mailer.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { PropositionsController } from './propositions.controller';
import { PropositionsService } from './propositions.service';

@Module({
  imports: [SupabaseModule],
  controllers: [PropositionsController],
  providers: [PropositionsService, MailerService],
  exports: [PropositionsService],
})
export class PropositionsModule {}
