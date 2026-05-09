import { IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class FactureLineDto {
  @IsString({ message: 'id ligne requis' })
  @MaxLength(100, { message: 'id ligne trop long' })
  id: string;

  @IsString({ message: 'titre requis' })
  @MaxLength(200, { message: 'titre trop long' })
  titre: string;

  @IsString({ message: 'description requise' })
  @MaxLength(5000, { message: 'description trop longue' })
  description: string;

  @IsNumber({}, { message: 'quantite doit être un nombre' })
  @Min(0.000001, { message: 'quantite doit être > 0' })
  quantite: number;

  @IsNumber({}, { message: 'prixUnitaireHt doit être un nombre' })
  @Min(0, { message: 'prixUnitaireHt doit être >= 0' })
  prixUnitaireHt: number;
}
