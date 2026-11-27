import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { LEAD_STATUSES } from '../status-map';

export class CreateCrmLeadDto {
  @IsString({ message: 'full_name requis' })
  @MinLength(1, { message: 'full_name requis' })
  @MaxLength(300)
  full_name!: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsEmail({}, { message: 'email invalide' })
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  company?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsUUID('4', { message: 'niche_id invalide' })
  niche_id?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsUUID('4', { message: 'owner_id invalide' })
  owner_id?: string | null;

  @IsOptional()
  @IsIn([...LEAD_STATUSES], { message: 'status CRM invalide' })
  status?: string;
}
