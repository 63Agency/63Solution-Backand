import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PORTAL_LEAD_STAGES } from '../portal-lead.stages';

export class ListLeadsQueryDto {
  /**
   * Filtre pipeline. Absent / "all" = tous les pipelines du client.
   * Sinon UUID d’un pipeline appartenant au client.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '' && v !== 'all')
  @IsUUID('4', { message: 'pipeline_id invalide' })
  pipeline_id?: string;

  @IsOptional()
  @IsIn([...PORTAL_LEAD_STAGES], {
    message: `stage doit être l’un de: ${PORTAL_LEAD_STAGES.join(', ')}`,
  })
  stage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
