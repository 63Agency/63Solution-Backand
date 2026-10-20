import { IsIn, IsString } from 'class-validator';

export const PROPOSITION_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
] as const;

export class UpdatePropositionStatusDto {
  @IsString({ message: 'status requis' })
  @IsIn(PROPOSITION_STATUSES, { message: 'status de proposition invalide' })
  status: (typeof PROPOSITION_STATUSES)[number];
}
