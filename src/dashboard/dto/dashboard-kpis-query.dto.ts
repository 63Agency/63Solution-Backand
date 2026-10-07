import { IsDateString, IsOptional } from 'class-validator';

/**
 * GET /dashboard/kpis?from=&to=
 * from/to optionnels ensemble (YYYY-MM-DD, jour Africa/Casablanca). Max 366 j.
 */
export class DashboardKpisQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'from doit être YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'to doit être YYYY-MM-DD' })
  to?: string;
}
