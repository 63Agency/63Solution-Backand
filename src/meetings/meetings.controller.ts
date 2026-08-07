import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import { assertCanAccessMeetings } from '../common/utils/access';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { CreateBlockedDayDto, ListBlockedDaysQueryDto } from './dto/blocked-day.dto';
import { ListMeetingsQueryDto } from './dto/list-meetings-query.dto';
import { SendReminderDto } from './dto/send-reminder.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { MeetingsBlockedDaysService } from './meetings-blocked-days.service';
import { MeetingsReminderService } from './meetings-reminder.service';
import { MeetingsService } from './meetings.service';

@Controller('meetings')
@UseGuards(AuthGuard('jwt'))
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly reminders: MeetingsReminderService,
    private readonly blockedDays: MeetingsBlockedDaysService,
  ) {}

  @Get()
  list(
    @Query() query: ListMeetingsQueryDto,
    @Req() req: { user: AppUser },
  ) {
    return this.meetings.list(query, req.user);
  }

  @Get('upcoming')
  upcoming(@Req() req: { user: AppUser }) {
    return this.meetings.upcoming(req.user);
  }

  @Get('today')
  today(@Req() req: { user: AppUser }) {
    return this.meetings.today(req.user);
  }

  @Get('stats')
  stats(@Req() req: { user: AppUser }) {
    return this.meetings.stats(req.user);
  }

  @Get('blocked-days')
  listBlockedDays(
    @Query() query: ListBlockedDaysQueryDto,
    @Req() req: { user: AppUser },
  ) {
    return this.blockedDays.list(query, req.user);
  }

  @Post('blocked-days')
  @HttpCode(HttpStatus.CREATED)
  createBlockedDay(
    @Body() dto: CreateBlockedDayDto,
    @Req() req: { user: AppUser },
  ) {
    return this.blockedDays.create(dto, req.user);
  }

  @Delete('blocked-days/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBlockedDay(
    @Param('id') id: string,
    @Req() req: { user: AppUser },
  ) {
    await this.blockedDays.remove(id, req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMeetingDto, @Req() req: { user: AppUser }) {
    return this.meetings.create(dto, req.user);
  }

  /** Admin-only: generate Meet links for future meetings missing meet_link. */
  @Post('backfill-meet-links')
  backfillMeetLinks(@Req() req: { user: AppUser }) {
    return this.meetings.backfillMeetLinks(req.user);
  }

  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
    @Req() req: { user: AppUser },
  ) {
    return this.meetings.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: { user: AppUser }) {
    return this.meetings.remove(id, req.user);
  }

  /**
   * Envoi manuel immédiat (admin + admin_whatsapp).
   * Template Meta `meeting_reminder_date` (fr) — hors fenêtre 24h.
   * Body optionnel : `{ "channel": "whatsapp"|"email" }`.
   * Réponse : `{ ok, whatsappSent, emailSent, whatsappError, emailError, meeting }`.
   */
  @Post(':id/send-reminder')
  async sendReminder(
    @Param('id') id: string,
    @Req() req: { user: AppUser },
    @Body() dto?: SendReminderDto,
  ) {
    assertCanAccessMeetings(req.user);
    return this.reminders.sendReminderForMeetingId(id, {
      // force=true : le bouton admin retente toujours (pas d’idempotence).
      force: true,
      channel: dto?.channel,
      offset: dto?.offset,
    });
  }

  /** Admin-only: regenerate a unique Google Meet link. */
  @Post(':id/regenerate-meet')
  regenerateMeet(
    @Param('id') id: string,
    @Req() req: { user: AppUser },
  ) {
    return this.meetings.regenerateMeetLink(id, req.user);
  }
}
