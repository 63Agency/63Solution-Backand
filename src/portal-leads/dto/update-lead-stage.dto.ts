import { IsIn } from 'class-validator';
import { PORTAL_LEAD_STAGES } from '../portal-lead.stages';

export class UpdateLeadStageDto {
  @IsIn([...PORTAL_LEAD_STAGES], {
    message: `stage doit être l’un de: ${PORTAL_LEAD_STAGES.join(', ')}`,
  })
  stage!: string;
}
