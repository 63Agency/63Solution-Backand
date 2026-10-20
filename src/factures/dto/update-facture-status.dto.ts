import { IsIn, IsString } from 'class-validator';

export const FACTURE_STATUSES = [
  'draft',
  'sent',
  'paid',
  'overdue',
  'pending',
  'cancelled',
] as const;

export class UpdateFactureStatusDto {
  @IsString({ message: 'status requis' })
  @IsIn(FACTURE_STATUSES, { message: 'status de facture invalide' })
  status: (typeof FACTURE_STATUSES)[number];
}
