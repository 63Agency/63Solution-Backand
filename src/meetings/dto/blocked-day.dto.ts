import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class ListBlockedDaysQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from doit être au format YYYY-MM-DD',
  })
  from?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to doit être au format YYYY-MM-DD',
  })
  to?: string;
}

export class CreateBlockedDayDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date doit être au format YYYY-MM-DD (Africa/Casablanca)',
  })
  date: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'reason invalide' })
  @MaxLength(500, { message: 'reason trop long' })
  reason?: string;
}
