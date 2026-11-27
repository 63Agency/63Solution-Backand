import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CRM_NICHE_COLORS } from './create-crm-niche.dto';

export class UpdateCrmNicheDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn([...CRM_NICHE_COLORS], { message: 'color invalide' })
  color?: string;
}
