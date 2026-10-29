import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PORTAL_REMINDER_TASK_TYPES } from '../portal-lead-activity.kinds';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class CreateLeadReminderDto {
  @IsIn([...PORTAL_REMINDER_TASK_TYPES], {
    message: `taskType doit être l’un de: ${PORTAL_REMINDER_TASK_TYPES.join(', ')}`,
  })
  taskType!: string;

  @IsDateString({}, { message: 'dueAt doit être une date ISO' })
  dueAt!: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'details invalide' })
  @MaxLength(2000, { message: 'details trop long' })
  details?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'actor invalide' })
  @IsNotEmpty({ message: 'actor invalide' })
  @MaxLength(200, { message: 'actor trop long' })
  actor?: string;
}
