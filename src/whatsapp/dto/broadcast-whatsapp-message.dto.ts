import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export class TemplateParameterDto {
  @IsString({ message: 'type requis' })
  type: string;

  @IsString({ message: 'text requis' })
  text: string;
}

export class TemplateComponentDto {
  @IsString({ message: 'type requis' })
  type: string;

  @IsArray({ message: 'parameters doit être un tableau' })
  @ValidateNested({ each: true })
  @Type(() => TemplateParameterDto)
  parameters: TemplateParameterDto[];
}

@ValidatorConstraint({ name: 'broadcastWhatsappMode', async: false })
class BroadcastWhatsappModeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args?: ValidationArguments): boolean {
    const o = args?.object as BroadcastWhatsappMessageDto | undefined;
    if (!o) return false;
    const hasText = typeof o.text === 'string' && o.text.trim().length > 0;
    const hasTemplate =
      typeof o.templateName === 'string' && o.templateName.trim().length > 0;
    return hasText !== hasTemplate;
  }

  defaultMessage(): string {
    return 'text ou templateName requis (un seul des deux)';
  }
}

export class BroadcastWhatsappMessageDto {
  @IsArray({ message: 'phoneNumbers doit être un tableau' })
  @ArrayMinSize(1, { message: 'au moins un numéro requis' })
  @IsString({ each: true, message: 'chaque numéro doit être une chaîne' })
  phoneNumbers: string[];

  @ValidateIf((o: BroadcastWhatsappMessageDto) => !o.templateName?.trim())
  @IsString({ message: 'text requis' })
  @MinLength(1, { message: 'text requis' })
  @MaxLength(4096, { message: 'text max 4096 caractères' })
  text?: string;

  @ValidateIf((o: BroadcastWhatsappMessageDto) => !o.text?.trim())
  @IsString({ message: 'templateName requis' })
  @MinLength(1, { message: 'templateName requis' })
  templateName?: string;

  @IsOptional()
  @IsString({ message: 'templateLanguage invalide' })
  templateLanguage?: string;

  @IsOptional()
  @IsArray({ message: 'components doit être un tableau' })
  @ValidateNested({ each: true })
  @Type(() => TemplateComponentDto)
  components?: TemplateComponentDto[];

  /** Replaces {{1}} in the template body. Preferred over nesting in components. */
  @IsOptional()
  @IsString({ message: 'variable1 invalide' })
  variable1?: string;

  @Validate(BroadcastWhatsappModeConstraint)
  private readonly _broadcastMode?: undefined;
}
