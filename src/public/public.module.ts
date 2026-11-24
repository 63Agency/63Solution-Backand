import { Module } from '@nestjs/common';
import { MailerService } from '../common/mailer/mailer.service';
import { EmailTrackingModule } from '../email/email-tracking.module';
import { ContactService } from './contact.service';
import { PublicController } from './public.controller';

@Module({
  imports: [EmailTrackingModule],
  controllers: [PublicController],
  providers: [ContactService, MailerService],
})
export class PublicModule {}
