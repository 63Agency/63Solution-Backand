import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class DevisLineDto {
  /** Optionnel pour les nouvelles lignes ; le serveur assigne un UUID si absent ou vide. */
  @IsOptional()
  @IsString({ message: 'id ligne invalide' })
  @MaxLength(100, { message: 'id ligne trop long' })
  id?: string;

  @IsString({ message: 'titre requis' })
  @MaxLength(200, { message: 'titre max 200 caractères' })
  titre: string;

  @IsString({ message: 'description requise' })
  @MaxLength(2000, { message: 'description max 2000 caractères' })
  description: string;

  @Type(() => Number)
  @IsInt({ message: 'quantite doit être un entier >= 1' })
  @Min(1, { message: 'quantite doit être >= 1' })
  quantite: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'prixUnitaireHt doit être un nombre' })
  @Min(0, { message: 'prixUnitaireHt doit être >= 0' })
  prixUnitaireHt: number;
}
