import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { MEETING_STATUSES } from '../types/meeting.types';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class ListMeetingsQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsDateString({}, { message: 'from invalide (ISO 8601)' })
  from?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsDateString({}, { message: 'to invalide (ISO 8601)' })
  to?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...MEETING_STATUSES], {
    message: 'status doit être scheduled | confirmed | bon_qualified | done | cancelled | no_show',
  })
  status?: string;

  /**
   * Filtre équipe (admin / admin_whatsapp uniquement) :
   * RDV où cet user est dans assignedUserIds.
   * Absent / vide = toute l’équipe (pas de filtre).
   */
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4', { message: 'assignedUserId invalide' })
  assignedUserId?: string;
}
