import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { MEETING_STATUSES, MEETING_TITLES } from '../types/meeting.types';
import { MeetingMemberDto } from './meeting-member.dto';
import { MeetingRemindersDto } from './meeting-reminders.dto';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class CreateMeetingDto {
  /**
   * UUID interne du lead (`GET /leads` → `id`).
   * Optionnel : sans leadId, contactName + (contactPhone | contactEmail) suffisent.
   */
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4', { message: 'leadId invalide' })
  leadId?: string;

  @IsIn([...MEETING_TITLES], {
    message:
      'title doit être : Audit Performance Marketing | Audit Performance Marketing présentiel | Audit Performance Marketing online',
  })
  title!: string;

  @IsDateString({}, { message: 'meetingDate requis (ISO 8601)' })
  meetingDate: string;

  @IsString({ message: 'contactName requis' })
  @MinLength(1, { message: 'contactName requis' })
  @MaxLength(200, { message: 'contactName trop long' })
  contactName: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'contactPhone invalide' })
  @MaxLength(30, { message: 'contactPhone trop long' })
  contactPhone?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEmail({}, { message: 'contactEmail invalide' })
  @MaxLength(120, { message: 'contactEmail trop long' })
  contactEmail?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...MEETING_STATUSES], {
    message: 'status doit être scheduled | confirmed | bon_qualified | done | cancelled | no_show',
  })
  status?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'notes invalide' })
  @MaxLength(5000, { message: 'notes trop long' })
  notes?: string;

  @IsOptional()
  @IsArray({ message: 'members doit être un tableau' })
  @ArrayMaxSize(50, { message: 'members max 50' })
  @ValidateNested({ each: true })
  @Type(() => MeetingMemberDto)
  members?: MeetingMemberDto[];

  /**
   * Users internes (staff) autorisés à voir ce RDV.
   * Distinct de `members` (leads clients). Le créateur est toujours inclus.
   */
  @IsOptional()
  @IsArray({ message: 'assignedUserIds doit être un tableau' })
  @ArrayMaxSize(100, { message: 'assignedUserIds max 100' })
  @IsUUID('4', { each: true, message: 'assignedUserIds contient un id invalide' })
  assignedUserIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => MeetingRemindersDto)
  reminders?: MeetingRemindersDto;

  /**
   * Si true : envoi immédiat confirmation (WA/email) au contact + members.
   * N’altère pas les jobs auto 2d/24h/2h.
   */
  @IsOptional()
  @IsBoolean({ message: 'notifyOnCreate doit être un booléen' })
  notifyOnCreate?: boolean;
}
