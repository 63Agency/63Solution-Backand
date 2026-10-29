import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

/** Corps POST /public/contact (site vitrine). */
export class ContactFormDto {
  @IsString({ message: 'name requis' })
  @IsNotEmpty({ message: 'name requis' })
  @MaxLength(200)
  name!: string;

  @IsEmail({}, { message: 'email invalide' })
  email!: string;

  /** Optionnel — le service n’exige que name + email. */
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'phone invalide' })
  @MaxLength(60, { message: 'phone max 60 caractères' })
  phone?: string;

  /** Plus demandé par le formulaire : conservé si le site l’envoie encore. */
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(200)
  role?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(500)
  objective?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(500)
  campaigns?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(200)
  sector?: string;

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
