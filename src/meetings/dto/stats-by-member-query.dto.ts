import { IsDateString, IsOptional } from 'class-validator';

/**
 * GET /meetings/stats/by-member?from=&to=
 * from/to optionnels (YYYY-MM-DD, jour Africa/Casablanca).
 * Absent → mois courant Casa. Max 366 jours.
 */
export class StatsByMemberQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'from doit être YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'to doit être YYYY-MM-DD' })
  to?: string;
}
