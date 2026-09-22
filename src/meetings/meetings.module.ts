import { Module } from '@nestjs/common';
import { MailerService } from '../common/mailer/mailer.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { GoogleMeetService } from './google-meet.service';
import { MeetingsAvailabilitiesService } from './meetings-availabilities.service';
import { MeetingsBlockedDaysService } from './meetings-blocked-days.service';
import { MeetingsController } from './meetings.controller';
import { MeetingsReminderService } from './meetings-reminder.service';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [SupabaseModule, WhatsappModule],
  controllers: [MeetingsController],
  providers: [
    MeetingsService,
    MeetingsBlockedDaysService,
    MeetingsAvailabilitiesService,
    MeetingsReminderService,
    MailerService,
    GoogleMeetService,
  ],
  exports: [
    MeetingsService,
    MeetingsReminderService,
    MeetingsBlockedDaysService,
    MeetingsAvailabilitiesService,
  ],
})
export class MeetingsModule {}
