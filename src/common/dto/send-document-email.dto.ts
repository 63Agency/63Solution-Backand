import { IsEmail, IsString, MaxLength } from 'class-validator';

export class SendDocumentEmailDto {
  @IsEmail({}, { message: 'to invalide' })
  @MaxLength(120, { message: 'to max 120 caractères' })
  to: string;

  @IsString({ message: 'subject requis' })
  @MaxLength(200, { message: 'subject max 200 caractères' })
  subject: string;

  @IsString({ message: 'message requis' })
  @MaxLength(5000, { message: 'message max 5000 caractères' })
  message: string;
}
