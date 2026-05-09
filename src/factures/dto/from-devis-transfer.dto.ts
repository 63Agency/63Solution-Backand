import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

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

export class FromDevisTransferDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TransferDevisTotalsDto)
  totals?: TransferDevisTotalsDto;
}
