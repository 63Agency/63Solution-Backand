import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

/** Corps POST /public/contact (site vitrine). */
export class ContactFormDto {
  @IsString({ message: 'name requis' })
  @MinLength(1, { message: 'name requis' })
  @MaxLength(200)
  name: string;

  @IsEmail({}, { message: 'email invalide' })
  @MaxLength(200)
  email: string;

  @IsString({ message: 'phone requis' })
  @MinLength(1, { message: 'phone requis' })
  @MaxLength(60)
  phone: string;

  @IsString({ message: 'role requis' })
  @MinLength(1, { message: 'role requis' })
  @MaxLength(200)
  role: string;

  @IsString({ message: 'objective requis' })
  @MinLength(1, { message: 'objective requis' })
  @MaxLength(500)
  objective: string;

  @IsString({ message: 'campaigns requis' })
  @MinLength(1, { message: 'campaigns requis' })
  @MaxLength(500)
  campaigns: string;

  @IsString({ message: 'sector requis' })
  @MinLength(1, { message: 'sector requis' })
  @MaxLength(200)
  sector: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(100)
  employees?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(120)
  budget?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(200)
  availability?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(200)
  establishment?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(5000)
  message?: string;

  /** Honeypot anti-spam — doit rester vide. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
