import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** GET /whatsapp/broadcast?limit= (défaut 50, max 100). */
export class BroadcastListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit doit être un entier' })
  @Min(1)
  @Max(100)
  limit?: number;
}
