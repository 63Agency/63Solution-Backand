import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** POST /proposals/pdf — client required; other fields optional (defaults in renderProposalPdf). */
export class StandaloneProposalPdfDto {
  @IsString({ message: 'client requis' })
  @IsNotEmpty({ message: 'client requis' })
  @MaxLength(200)
  client!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  offerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  price?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  period?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adBudget?: string;
}
