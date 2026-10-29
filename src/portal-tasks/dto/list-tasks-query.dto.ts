import { IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { PORTAL_TASK_STATUSES } from '../portal-task.constants';

export class ListTasksQueryDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '' && v !== 'all')
  @IsUUID('4', { message: 'pipeline_id invalide' })
  pipeline_id?: string;

  @IsOptional()
  @IsIn([...PORTAL_TASK_STATUSES], {
    message: `status doit être l’un de: ${PORTAL_TASK_STATUSES.join(', ')}`,
  })
  status?: string;
}
