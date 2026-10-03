import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** GET /admin/activity?limit= (défaut 30, max 50). */
export class ActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit doit être un entier' })
  @Min(1)
  @Max(50)
  limit?: number;
}
