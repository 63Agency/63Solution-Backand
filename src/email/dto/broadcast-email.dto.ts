import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BroadcastEmailRecipientDto {
  /**
   * Soft validation: invalid / empty emails are skipped in EmailService
   * (do not fail the whole broadcast). Prefer string over @IsEmail.
   */
  @IsString({ message: 'email invalide' })
  @MaxLength(200, { message: 'email trop long' })
  email!: string;

  @IsOptional()
  @IsString({ message: 'name invalide' })
  @MaxLength(200, { message: 'name trop long' })
  name?: string;
}

export class BroadcastEmailDto {
  @IsString({ message: 'subject requis' })
  @MinLength(1, { message: 'subject requis' })
  @MaxLength(500, { message: 'subject trop long' })
  subject!: string;

  @IsString({ message: 'html requis' })
  @MinLength(1, { message: 'html requis' })
  @MaxLength(200_000, { message: 'html trop long' })
  html!: string;

  @IsArray({ message: 'recipients doit être un tableau' })
  @ArrayMinSize(1, { message: 'au moins un destinataire requis' })
  @ValidateNested({ each: true })
  @Type(() => BroadcastEmailRecipientDto)
  recipients!: BroadcastEmailRecipientDto[];

  /** Métadonnée front (catalogue WA) — ignorée à l’envoi SMTP. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  templateId?: string;

  /** Métadonnée front (ex. just_bonjour) — ignorée à l’envoi SMTP. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  templateName?: string;
}
