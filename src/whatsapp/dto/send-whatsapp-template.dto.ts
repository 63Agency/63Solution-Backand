import { IsOptional, IsString, MinLength } from 'class-validator';

/** Envoi template Meta lié à une conversation CRM. */
export class SendWhatsappTemplateDto {
  @IsString({ message: 'templateName requis' })
  @MinLength(1, { message: 'templateName requis' })
  templateName!: string;

  @IsOptional()
  @IsString({ message: 'templateLanguage invalide' })
  templateLanguage?: string;

  /** Remplace {{1}} dans le body du template (ex. prénom). */
  @IsOptional()
  @IsString({ message: 'variable1 invalide' })
  variable1?: string;
}
