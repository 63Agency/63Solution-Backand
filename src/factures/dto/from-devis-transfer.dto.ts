import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { FactureLineDto } from './facture-line.dto';

export class TransferDevisTotalsDto {
  @IsNumber({}, { message: 'totalHt doit être un nombre' })
  @Min(0, { message: 'totalHt doit être ≥ 0' })
  totalHt: number;

  @IsNumber({}, { message: 'montantTva doit être un nombre' })
  @Min(0, { message: 'montantTva doit être ≥ 0' })
  montantTva: number;

  @IsNumber({}, { message: 'totalTtc doit être un nombre' })
  @Min(0, { message: 'totalTtc doit être ≥ 0' })
  totalTtc: number;
}

/** Corps POST pour les trois alias : from-devis, transfer-to-facture, convert. */
export class FromDevisTransferDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TransferDevisTotalsDto)
  totals?: TransferDevisTotalsDto;

  /** Lignes éditées dans la modal ; si absent, copie des lignes du devis. */
  @IsOptional()
  @IsArray({ message: 'lignes doit être un tableau' })
  @ArrayMaxSize(200, { message: 'lignes max 200 éléments' })
  @ValidateNested({ each: true })
  @Type(() => FactureLineDto)
  lignes?: FactureLineDto[];

  /** Pourcentage TVA (ex. 20) ; avec lignes, défaut = taux du devis si omis. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'tvaTaux doit être un nombre' })
  @Min(0, { message: 'tvaTaux doit être entre 0 et 100' })
  @Max(100, { message: 'tvaTaux doit être entre 0 et 100' })
  tvaTaux?: number;
}
