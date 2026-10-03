import { IsDateString, IsOptional } from 'class-validator';

/**
 * GET /leads/stats/overview?from=&to=
 * from/to optionnels ensemble (YYYY-MM-DD, jour Africa/Casablanca). Max 366 j.
 */
export class LeadsStatsOverviewQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'from doit être YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'to doit être YYYY-MM-DD' })
  to?: string;
}
