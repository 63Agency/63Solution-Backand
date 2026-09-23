import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class BroadcastChannelsDto {
  @IsOptional()
  @IsBoolean({ message: 'channels.whatsapp doit être un booléen' })
  whatsapp?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'channels.email doit être un booléen' })
  email?: boolean;
}

/**
 * Destinataire multi-canal.
 * Au moins phoneNumber ou email selon les canaux activés.
 */
export class BroadcastRecipientDto {
  @IsOptional()
  @IsString({ message: 'phoneNumber invalide' })
  phoneNumber?: string;

  @IsOptional()
  @IsString({ message: 'email invalide' })
  @MaxLength(200, { message: 'email trop long' })
  email?: string;

  /** Nom pour {{name}} / {{1}} (email + WA variable1). */
  @IsOptional()
  @IsString({ message: 'name invalide' })
  @MaxLength(200, { message: 'name trop long' })
  name?: string;

  /** Alias legacy WA {{1}} — sinon name. */
  @IsOptional()
  @IsString({ message: 'variable1 invalide' })
  variable1?: string;
}

@ValidatorConstraint({ name: 'broadcastJobTargets', async: false })
class BroadcastJobTargetsConstraint implements ValidatorConstraintInterface {
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

@ValidatorConstraint({ name: 'broadcastJobChannels', async: false })
class BroadcastJobChannelsConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args?: ValidationArguments): boolean {
    const o = args?.object as CreateBroadcastDto | undefined;
    if (!o) return false;
    const wa = o.channels?.whatsapp !== false; // défaut true si absent
    const em = o.channels?.email === true;
    // Au moins un canal
    if (!wa && !em) return false;
    if (wa && !o.templateName?.trim()) return false;
    if (em && (!o.emailSubject?.trim() || !o.emailHtml?.trim())) return false;
    return true;
  }

  defaultMessage(): string {
    return (
      'channels: au moins whatsapp ou email ; ' +
      'templateName requis si whatsapp ; ' +
      'emailSubject + emailHtml requis si email'
    );
  }
}

/**
 * Broadcast async multi-canal (WhatsApp template ± email).
 *
 * Compat :
 * - Forme A : phoneNumbers[] + variable1?/components?
 * - Forme B : recipients[{ phoneNumber?, email?, name?, variable1? }]
 * Si les deux → recipients gagne.
 * channels défaut : { whatsapp: true, email: false }.
 */
export class CreateBroadcastDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BroadcastChannelsDto)
  channels?: BroadcastChannelsDto;

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

  @ValidateIf((o: CreateBroadcastDto) => o.channels?.whatsapp !== false)
  @IsString({ message: 'templateName requis' })
  @MinLength(1, { message: 'templateName requis' })
  templateName?: string;

  @IsOptional()
  @IsString({ message: 'templateLanguage invalide' })
  templateLanguage?: string;

  @IsOptional()
  @IsString({ message: 'variable1 invalide' })
  variable1?: string;

  @IsOptional()
  @IsArray({ message: 'components doit être un tableau' })
  @ValidateNested({ each: true })
  @Type(() => BroadcastTemplateComponentDto)
  components?: BroadcastTemplateComponentDto[];

  @ValidateIf((o: CreateBroadcastDto) => o.channels?.email === true)
  @IsString({ message: 'emailSubject requis' })
  @MinLength(1, { message: 'emailSubject requis' })
  @MaxLength(500, { message: 'emailSubject trop long' })
  emailSubject?: string;

  @ValidateIf((o: CreateBroadcastDto) => o.channels?.email === true)
  @IsString({ message: 'emailHtml requis' })
  @MinLength(1, { message: 'emailHtml requis' })
  @MaxLength(200_000, { message: 'emailHtml trop long' })
  emailHtml?: string;

  @Validate(BroadcastJobTargetsConstraint)
  private readonly _broadcastTargets?: undefined;

  @Validate(BroadcastJobChannelsConstraint)
  private readonly _broadcastChannels?: undefined;
}
