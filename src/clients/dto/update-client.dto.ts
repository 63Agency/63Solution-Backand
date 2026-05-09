import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

/**
 * Corps attendu par le front.
 * (snake_case possible côté app : mapper avant envoi ou étendre ce DTO si besoin.)
 */
export class UpdateClientDto {
  @IsString({ message: 'clientNom requis' })
  @MinLength(1, { message: 'clientNom requis' })
  @MaxLength(200, { message: 'clientNom trop long' })
  clientNom: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEmail({}, { message: 'clientEmail invalide' })
  @MaxLength(120, { message: 'clientEmail max 120 caractères' })
  clientEmail?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'clientTelephone invalide' })
  @MaxLength(60, { message: 'clientTelephone max 60 caractères' })
  clientTelephone?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'clientIce invalide' })
  @MaxLength(100, { message: 'clientIce trop long' })
  clientIce?: string;
}
