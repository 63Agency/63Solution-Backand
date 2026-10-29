import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class UpdateTeamMemberDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'name invalide' })
  @IsNotEmpty({ message: 'name invalide' })
  @MaxLength(200, { message: 'name trop long' })
  name?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEmail({}, { message: 'email invalide' })
  email?: string;

  /** Omise ou vide → password_hash inchangé. */
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, v) => v !== undefined)
  @IsString({ message: 'mot de passe invalide' })
  @MinLength(8, { message: 'mot de passe: au moins 8 caractères' })
  password?: string;
}
