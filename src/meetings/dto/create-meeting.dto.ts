import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MEETING_STATUSES } from '../types/meeting.types';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class CreateMeetingDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4', { message: 'leadId invalide' })
  leadId?: string;

  @IsString({ message: 'title requis' })
  @MinLength(1, { message: 'title requis' })
  @MaxLength(300, { message: 'title trop long' })
  title: string;

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
    message: 'status doit être scheduled | done | cancelled | no_show',
  })
  status?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'notes invalide' })
  @MaxLength(5000, { message: 'notes trop long' })
  notes?: string;
}
