import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/**
 * POST /me/mail-account/test
 * Tous les champs optionnels : si omis, utilise le compte stocké.
 */
export class TestMailAccountDto {
  @IsOptional()
  @IsEmail({}, { message: 'email invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  from_name?: string | null;

  @IsOptional()
  @IsString()
  smtp_host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  smtp_port?: number;

  @IsOptional()
  @IsBoolean()
  smtp_secure?: boolean;

  @IsOptional()
  @IsString()
  imap_host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  imap_port?: number;

  @IsOptional()
  @IsBoolean()
  imap_secure?: boolean;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;
}
