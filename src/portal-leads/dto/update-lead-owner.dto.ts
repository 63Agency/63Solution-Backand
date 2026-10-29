import { IsString, MaxLength } from 'class-validator';

export class UpdateLeadOwnerDto {
  /** Chaîne vide → owner null en base. */
  @IsString({ message: 'owner requis' })
  @MaxLength(200, { message: 'owner trop long' })
  owner!: string;
}
