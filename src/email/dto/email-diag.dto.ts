import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export const EMAIL_DIAG_MODES = [
  'raw',
  'full',
  'pixel',
  'unsub',
  'headers',
] as const;

export type EmailDiagMode = (typeof EMAIL_DIAG_MODES)[number];

export class EmailDiagDto {
  @IsString({ message: 'to requis' })
  @MinLength(1, { message: 'to requis' })
  @MaxLength(200, { message: 'to trop long' })
  to!: string;

  /** Front may send RAW/FULL/PIXEL/… — normalize to lowercase. */
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsIn(EMAIL_DIAG_MODES, {
    message: 'mode doit être raw, full, pixel, unsub ou headers',
  })
  mode!: EmailDiagMode;
}
