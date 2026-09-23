import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BroadcastTemplateParameterDto {
  @IsString({ message: 'type requis' })
  type!: string;

  @IsString({ message: 'text requis' })
  text!: string;
}

export class BroadcastTemplateComponentDto {
  @IsString({ message: 'type requis' })
  type!: string;

  @IsArray({ message: 'parameters doit être un tableau' })
  @ValidateNested({ each: true })
  @Type(() => BroadcastTemplateParameterDto)
  parameters!: BroadcastTemplateParameterDto[];
}

/** Bulk WhatsApp — template only (async job). */
export class CreateBroadcastDto {
  @IsArray({ message: 'phoneNumbers doit être un tableau' })
  @ArrayMinSize(1, { message: 'au moins un numéro requis' })
  @IsString({ each: true, message: 'chaque numéro doit être une chaîne' })
  phoneNumbers!: string[];

  @IsString({ message: 'templateName requis' })
  @MinLength(1, { message: 'templateName requis' })
  templateName!: string;

  @IsOptional()
  @IsString({ message: 'templateLanguage invalide' })
  templateLanguage?: string;

  /** Remplace {{1}} — valeur globale pour tout le job. */
  @IsOptional()
  @IsString({ message: 'variable1 invalide' })
  variable1?: string;

  @IsOptional()
  @IsArray({ message: 'components doit être un tableau' })
  @ValidateNested({ each: true })
  @Type(() => BroadcastTemplateComponentDto)
  components?: BroadcastTemplateComponentDto[];
}
