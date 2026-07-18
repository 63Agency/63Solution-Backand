import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SendWhatsappMessageDto {
  /**
   * Texte / légende. Requis si pas de média.
   * Pour un média, peut être vide (légende optionnelle).
   */
  @ValidateIf((o: SendWhatsappMessageDto) => !o.mediaUrl?.trim())
  @IsString({ message: 'text requis' })
  @MinLength(1, { message: 'text requis' })
  @MaxLength(4096, { message: 'text max 4096 caractères' })
  text?: string;

  /**
   * Meta wamid (ex. wamid.HBg...) OU uuid interne du message cité.
   * Envoyé à Meta via context.message_id pour afficher la réponse chez le destinataire.
   */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  replyToMessageId?: string;

  /** Type de média Cloudinary / WhatsApp. */
  @ValidateIf((o: SendWhatsappMessageDto) => Boolean(o.mediaUrl?.trim()))
  @IsIn(['image', 'video', 'document'], {
    message: 'type doit être image, video ou document',
  })
  type?: 'image' | 'video' | 'document';

  /** URL publique Cloudinary (HTTPS). */
  @IsOptional()
  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    { message: 'mediaUrl doit être une URL https' },
  )
  @MaxLength(2048)
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200 * 1024 * 1024)
  fileSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;
}
