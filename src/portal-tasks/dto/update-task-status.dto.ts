import { IsIn } from 'class-validator';
import { PORTAL_TASK_STATUSES } from '../portal-task.constants';

export class UpdateTaskStatusDto {
  @IsIn([...PORTAL_TASK_STATUSES], {
    message: `status doit être l’un de: ${PORTAL_TASK_STATUSES.join(', ')}`,
  })
  status!: string;
}
