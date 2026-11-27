import { IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { LEAD_STATUSES } from '../status-map';

export class PatchCrmLeadDto {
  @IsOptional()
  @IsIn([...LEAD_STATUSES], { message: 'status CRM invalide' })
  status?: string;

  /** null = clear niche */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID('4', { message: 'niche_id invalide' })
  niche_id?: string | null;

  /** null = clear owner */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID('4', { message: 'owner_id invalide' })
  owner_id?: string | null;
}
