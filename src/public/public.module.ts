import { Module } from '@nestjs/common';
import { MailerService } from '../common/mailer/mailer.service';
import { ContactService } from './contact.service';
import { PublicController } from './public.controller';

@Module({
  controllers: [PublicController],
  providers: [ContactService, MailerService],
})
export class PublicModule {}
