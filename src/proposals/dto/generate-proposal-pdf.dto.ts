import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** POST /leads/:id/proposal/pdf — all fields optional; defaults live in renderProposalPdf. */
export class GenerateProposalPdfDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  client?: string;

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

  /** PDF copy language — `fr` | `en` (default `en`). */
  @IsOptional()
  @IsString()
  @IsIn(['fr', 'en'], { message: 'language doit être fr ou en' })
  language?: 'fr' | 'en';
}
