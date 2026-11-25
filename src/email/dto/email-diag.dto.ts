import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class EmailDiagDto {
  @IsString({ message: 'to requis' })
  @MinLength(1, { message: 'to requis' })
  @MaxLength(200, { message: 'to trop long' })
  to!: string;

  /** Front may send RAW/FULL — normalize to lowercase. */
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsIn(['raw', 'full'], { message: 'mode doit être raw ou full' })
  mode!: 'raw' | 'full';
}
