import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  MEETING_DURATIONS,
  MEETING_STATUSES,
  MEETING_STATUS_LABEL,
  MEETING_TITLES,
  MEETING_TITLE_LABEL,
} from '../types/meeting.types';
import { MeetingMemberDto } from './meeting-member.dto';
import { MeetingRemindersDto } from './meeting-reminders.dto';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class UpdateMeetingDto {
  /**
   * UUID interne du lead (`GET /leads` → `id`).
   * null / absent = RDV manuel (contactName + téléphone ou email).
   */
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4', { message: 'leadId invalide' })
  leadId?: string | null;

  @IsOptional()
  @IsIn([...MEETING_TITLES], {
    message: `title doit être : ${MEETING_TITLE_LABEL}`,
  })
  title?: string;

  @IsOptional()
  @IsDateString({}, { message: 'meetingDate invalide (ISO 8601)' })
  meetingDate?: string;

  /** Durée en minutes. Valeurs : 15 | 30 | 45 | 60 | 90 | 120. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'durationMinutes doit être un entier' })
  @IsIn([...MEETING_DURATIONS], {
    message: `durationMinutes doit être : ${MEETING_DURATIONS.join(' | ')}`,
  })
  durationMinutes?: number;

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
    message: `status doit être ${MEETING_STATUS_LABEL}`,
  })
  status?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'notes invalide' })
  @MaxLength(5000, { message: 'notes trop long' })
  notes?: string | null;

  /** Remplace toute la liste (pas de merge). Absent = inchangé. */
  @IsOptional()
  @IsArray({ message: 'members doit être un tableau' })
  @ArrayMaxSize(50, { message: 'members max 50' })
  @ValidateNested({ each: true })
  @Type(() => MeetingMemberDto)
  members?: MeetingMemberDto[];

  /**
   * Remplace toute la liste assignees (staff). Absent = inchangé.
   * Le créateur reste toujours inclus.
   * Distinct de setterId / closerId (rôles commission).
   */
  @IsOptional()
  @IsArray({ message: 'assignedUserIds doit être un tableau' })
  @ArrayMaxSize(100, { message: 'assignedUserIds max 100' })
  @IsUUID('4', { each: true, message: 'assignedUserIds contient un id invalide' })
  assignedUserIds?: string[];

  /** Qui a pris le RDV. null = effacer. Absent = inchangé. */
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID('4', { message: 'setterId invalide' })
  setterId?: string | null;

  /** Tag closer. null = effacer. Absent = inchangé. */
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID('4', { message: 'closerId invalide' })
  closerId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => MeetingRemindersDto)
  reminders?: MeetingRemindersDto;
}
