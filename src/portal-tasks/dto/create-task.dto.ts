import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PORTAL_TASK_TYPES } from '../portal-task.constants';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class CreateTaskDto {
  @IsUUID('4', { message: 'lead_id invalide' })
  lead_id!: string;

  @IsString({ message: 'lead_name requis' })
  @IsNotEmpty({ message: 'lead_name requis' })
  @MaxLength(200, { message: 'lead_name trop long' })
  lead_name!: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'phone invalide' })
  @MaxLength(60, { message: 'phone max 60 caractères' })
  phone?: string;

  @IsUUID('4', { message: 'pipeline_id invalide' })
  pipeline_id!: string;

  @IsIn([...PORTAL_TASK_TYPES], {
    message: `task_type doit être l’un de: ${PORTAL_TASK_TYPES.join(', ')}`,
  })
  task_type!: string;

  @IsDateString({}, { message: 'due_at doit être une date ISO' })
  due_at!: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'details invalide' })
  @MaxLength(2000, { message: 'details trop long' })
  details?: string;
}
