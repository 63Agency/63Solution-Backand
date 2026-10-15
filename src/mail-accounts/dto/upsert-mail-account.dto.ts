import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/**
 * PUT /me/mail-account — upsert.
 * `password` requis à la création ; optionnel à la mise à jour (conserve l’existant).
 */
export class UpsertMailAccountDto {
  @IsEmail({}, { message: 'email invalide' })
  @IsNotEmpty({ message: 'email requis' })
  email: string;

  @IsOptional()
  @IsString()
  from_name?: string | null;

  @IsString({ message: 'smtp_host requis' })
  @IsNotEmpty({ message: 'smtp_host requis' })
  smtp_host: string;

  @Type(() => Number)
  @IsInt({ message: 'smtp_port invalide' })
  @Min(1)
  @Max(65535)
  smtp_port: number = 465;

  @IsBoolean({ message: 'smtp_secure invalide' })
  smtp_secure: boolean = true;

  @IsString({ message: 'imap_host requis' })
  @IsNotEmpty({ message: 'imap_host requis' })
  imap_host: string;

  @Type(() => Number)
  @IsInt({ message: 'imap_port invalide' })
  @Min(1)
  @Max(65535)
  imap_port: number = 993;

  @IsBoolean({ message: 'imap_secure invalide' })
  imap_secure: boolean = true;

  @IsString({ message: 'username requis' })
  @IsNotEmpty({ message: 'username requis' })
  username: string;

  /** Plaintext — chiffré côté service. Omise = garder password_enc existant. */
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'password ne peut pas être vide' })
  password?: string;
}
