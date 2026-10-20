import { IsIn, IsString } from 'class-validator';

export const DEVIS_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'pending',
  'cancelled',
] as const;

export class UpdateDevisStatusDto {
  @IsString({ message: 'status requis' })
  @IsIn(DEVIS_STATUSES, { message: 'status de devis invalide' })
  status: (typeof DEVIS_STATUSES)[number];
}
