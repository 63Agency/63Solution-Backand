import { Type } from 'class-transformer';
import { IsDateString } from 'class-validator';

/** GET /meetings/stats/by-day?from=&to= (YYYY-MM-DD, jour Africa/Casablanca). */
export class StatsByDayQueryDto {
  @IsDateString({}, { message: 'from doit être YYYY-MM-DD' })
  from!: string;

  @IsDateString({}, { message: 'to doit être YYYY-MM-DD' })
  to!: string;
}
