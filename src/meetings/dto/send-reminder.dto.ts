import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  REMINDER_CHANNELS,
  REMINDER_OFFSETS,
} from '../types/meeting.types';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class SendReminderDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...REMINDER_CHANNELS], {
    message: 'channel doit être whatsapp | email',
  })
  channel?: 'whatsapp' | 'email';

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...REMINDER_OFFSETS], {
    message: 'offset doit être 2d | 24h | 2h',
  })
  offset?: '2d' | '24h' | '2h';

  /** true = ignorer l’idempotence (re-envoyer même après notifyOnCreate récent). */
  @IsOptional()
  @IsBoolean({ message: 'force doit être un booléen' })
  force?: boolean;
}
