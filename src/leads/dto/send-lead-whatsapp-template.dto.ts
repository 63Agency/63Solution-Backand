import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/** POST /leads/:id/whatsapp/template */
export class SendLeadWhatsappTemplateDto {
  @IsString({ message: 'templateName requis' })
  @MinLength(1, { message: 'templateName requis' })
  templateName!: string;

  @IsOptional()
  @IsString()
  language?: string;

  /** Body params Meta {{1}}, {{2}}, … dans l’ordre. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  variables?: string[];
}
