import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MEETING_STATUSES } from '../types/meeting.types';
import { MeetingRemindersDto } from './meeting-reminders.dto';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class UpdateMeetingDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4', { message: 'leadId invalide' })
  leadId?: string | null;

  @IsOptional()
  @IsString({ message: 'title invalide' })
  @MinLength(1, { message: 'title requis' })
  @MaxLength(300, { message: 'title trop long' })
  title?: string;

  @IsOptional()
  @IsDateString({}, { message: 'meetingDate invalide (ISO 8601)' })
  meetingDate?: string;

  @IsOptional()
  @IsString({ message: 'contactName invalide' })
  @MinLength(1, { message: 'contactName requis' })
  @MaxLength(200, { message: 'contactName trop long' })
  contactName?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'contactPhone invalide' })
  @MaxLength(30, { message: 'contactPhone trop long' })
  contactPhone?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEmail({}, { message: 'contactEmail invalide' })
  @MaxLength(120, { message: 'contactEmail trop long' })
  contactEmail?: string | null;

  @IsOptional()
  @IsIn([...MEETING_STATUSES], {
    message: 'status doit être scheduled | done | cancelled | no_show',
  })
  status?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'notes invalide' })
  @MaxLength(5000, { message: 'notes trop long' })
  notes?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => MeetingRemindersDto)
  reminders?: MeetingRemindersDto;
}
