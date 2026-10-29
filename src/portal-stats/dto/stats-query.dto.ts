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

const CONTACT_THRESHOLDS = [15, 30, 60, 120, 1440] as const;

export class StatsScopeQueryDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '' && v !== 'all')
  @IsUUID('4', { message: 'pipeline_id invalide' })
  pipeline_id?: string;
}

export class SuiviStatsQueryDto extends StatsScopeQueryDto {
  /** Aligné CONTACT_THRESHOLD_OPTIONS front (défaut 30 min). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...CONTACT_THRESHOLDS], {
    message: `threshold_minutes doit être l’un de: ${CONTACT_THRESHOLDS.join(', ')}`,
  })
  threshold_minutes?: number;
}

export class ActivityFeedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
