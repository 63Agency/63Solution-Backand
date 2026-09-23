import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
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

/** Destinataire personnalisé (forme B) — variable1 pour {{1}}. */
export class BroadcastRecipientDto {
  @IsString({ message: 'phoneNumber requis' })
  @MinLength(1, { message: 'phoneNumber requis' })
  phoneNumber!: string;

  @IsOptional()
  @IsString({ message: 'variable1 invalide' })
  variable1?: string;
}

@ValidatorConstraint({ name: 'broadcastRecipientsOrPhones', async: false })
class BroadcastTargetsConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args?: ValidationArguments): boolean {
    const o = args?.object as CreateBroadcastDto | undefined;
    if (!o) return false;
    const hasPhones =
      Array.isArray(o.phoneNumbers) && o.phoneNumbers.length > 0;
    const hasRecipients =
      Array.isArray(o.recipients) && o.recipients.length > 0;
    return hasPhones || hasRecipients;
  }

  defaultMessage(): string {
    return 'phoneNumbers[] ou recipients[] requis (au moins un non vide)';
  }
}

/**
 * Bulk WhatsApp — template only (async job).
 *
 * Forme A (globale) : phoneNumbers + variable1?/components?
 * Forme B (perso)   : recipients[{ phoneNumber, variable1? }]
 * Si les deux sont fournis → recipients est privilégié.
 */
export class CreateBroadcastDto {
  @IsOptional()
  @ValidateIf(
    (o: CreateBroadcastDto) =>
      !Array.isArray(o.recipients) || o.recipients.length === 0,
  )
  @IsArray({ message: 'phoneNumbers doit être un tableau' })
  @ArrayMinSize(1, { message: 'au moins un numéro requis' })
  @IsString({ each: true, message: 'chaque numéro doit être une chaîne' })
  phoneNumbers?: string[];

  @IsOptional()
  @ValidateIf(
    (o: CreateBroadcastDto) =>
      !Array.isArray(o.phoneNumbers) || o.phoneNumbers.length === 0,
  )
  @IsArray({ message: 'recipients doit être un tableau' })
  @ArrayMinSize(1, { message: 'au moins un destinataire requis' })
  @ValidateNested({ each: true })
  @Type(() => BroadcastRecipientDto)
  recipients?: BroadcastRecipientDto[];

  @IsString({ message: 'templateName requis' })
  @MinLength(1, { message: 'templateName requis' })
  templateName!: string;

  @IsOptional()
  @IsString({ message: 'templateLanguage invalide' })
  templateLanguage?: string;

  /** Remplace {{1}} — valeur globale (forme A uniquement). */
  @IsOptional()
  @IsString({ message: 'variable1 invalide' })
  variable1?: string;

  @IsOptional()
  @IsArray({ message: 'components doit être un tableau' })
  @ValidateNested({ each: true })
  @Type(() => BroadcastTemplateComponentDto)
  components?: BroadcastTemplateComponentDto[];

  @Validate(BroadcastTargetsConstraint)
  private readonly _broadcastTargets?: undefined;
}
