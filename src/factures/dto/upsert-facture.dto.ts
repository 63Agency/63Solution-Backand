import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FactureLineDto } from './facture-line.dto';

export class UpsertFactureDto {
  @IsString({ message: 'societeNom requis' })
  @MaxLength(150, { message: 'societeNom max 150 caractères' })
  societeNom: string;

  @IsString({ message: 'societeRc requis' })
  @MaxLength(60, { message: 'societeRc max 60 caractères' })
  societeRc: string;

  @IsString({ message: 'societeCnie requis' })
  @MaxLength(60, { message: 'societeCnie max 60 caractères' })
  societeCnie: string;

  @IsString({ message: 'societeIce requis' })
  @MaxLength(60, { message: 'societeIce max 60 caractères' })
  societeIce: string;

  @IsString({ message: 'societeTp requis' })
  @MaxLength(60, { message: 'societeTp max 60 caractères' })
  societeTp: string;

  @IsString({ message: 'societeAdresse requise' })
  @MaxLength(255, { message: 'societeAdresse max 255 caractères' })
  societeAdresse: string;

  @IsString({ message: 'societeTelephone requis' })
  @MaxLength(60, { message: 'societeTelephone max 60 caractères' })
  societeTelephone: string;

  @IsString({ message: 'societeEmail requis' })
  @MaxLength(120, { message: 'societeEmail max 120 caractères' })
  societeEmail: string;

  @IsString({ message: 'clientNom requis' })
  @MaxLength(200, { message: 'clientNom trop long' })
  clientNom: string;

  @IsString({ message: 'clientIce requis' })
  @IsOptional()
  @MaxLength(100, { message: 'clientIce trop long' })
  clientIce?: string;

  @IsEmail({}, { message: 'clientEmail invalide' })
  @IsOptional()
  @MaxLength(120, { message: 'clientEmail max 120 caractères' })
  clientEmail?: string;

  @IsString({ message: 'clientTelephone invalide' })
  @IsOptional()
  @MaxLength(60, { message: 'clientTelephone max 60 caractères' })
  clientTelephone?: string;

  @IsString({ message: 'factureNumero invalide' })
  @IsOptional()
  @MaxLength(100, { message: 'factureNumero trop long' })
  factureNumero?: string;

  @IsDateString({}, { message: 'dateEmission invalide (YYYY-MM-DD)' })
  dateEmission: string;

  @IsArray({ message: 'lignes doit être un tableau' })
  @ArrayMinSize(1, { message: 'au moins 1 ligne est requise' })
  @ArrayMaxSize(200, { message: 'lignes max 200 éléments' })
  @ValidateNested({ each: true })
  @Type(() => FactureLineDto)
  lignes: FactureLineDto[];

  @IsNumber({}, { message: 'tvaTaux doit être un nombre' })
  @Min(0, { message: 'tvaTaux doit être entre 0 et 100' })
  @Max(100, { message: 'tvaTaux doit être entre 0 et 100' })
  tvaTaux: number;

  @IsString({ message: 'mentionTva requise' })
  @MaxLength(2000, { message: 'mentionTva trop longue' })
  mentionTva: string;

  @IsString({ message: 'paiementMode requis' })
  @MaxLength(200, { message: 'paiementMode trop long' })
  paiementMode: string;

  @IsString({ message: 'paiementBanque requis' })
  @MaxLength(200, { message: 'paiementBanque trop long' })
  paiementBanque: string;

  @IsString({ message: 'paiementTitulaire requis' })
  @MaxLength(200, { message: 'paiementTitulaire trop long' })
  paiementTitulaire: string;

  @IsString({ message: 'paiementRib requis' })
  @MaxLength(200, { message: 'paiementRib trop long' })
  paiementRib: string;
}
