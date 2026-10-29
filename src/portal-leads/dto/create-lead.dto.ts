import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class CreateLeadDto {
  @IsString({ message: 'name requis' })
  @IsNotEmpty({ message: 'name requis' })
  @MaxLength(200, { message: 'name trop long' })
  name!: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'phone invalide' })
  @MaxLength(60, { message: 'phone max 60 caractères' })
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEmail({}, { message: 'email invalide' })
  @MaxLength(120, { message: 'email max 120 caractères' })
  email?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'campaign invalide' })
  @MaxLength(200, { message: 'campaign trop long' })
  campaign?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'estimated_value doit être un nombre' })
  @Min(0, { message: 'estimated_value doit être ≥ 0' })
  estimated_value?: number;

  @IsUUID('4', { message: 'pipeline_id invalide' })
  pipeline_id!: string;
}
