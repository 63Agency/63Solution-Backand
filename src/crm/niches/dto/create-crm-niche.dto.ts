import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const CRM_NICHE_COLORS = [
  'blue',
  'red',
  'teal',
  'gray',
  'yellow',
  'orange',
  'purple',
  'brown',
  'green',
] as const;

export type CrmNicheColor = (typeof CRM_NICHE_COLORS)[number];

export class CreateCrmNicheDto {
  @IsString({ message: 'name requis' })
  @MinLength(1, { message: 'name requis' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn([...CRM_NICHE_COLORS], { message: 'color invalide' })
  color?: string;
}
