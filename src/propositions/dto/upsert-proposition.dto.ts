import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PropositionEmetteurDto {
  @IsString({ message: 'societeNom requis' })
  @MaxLength(150)
  societeNom: string;

  @IsString()
  @MaxLength(60)
  societeRc: string;

  @IsString()
  @MaxLength(60)
  societeCnie: string;

  @IsString()
  @MaxLength(60)
  societeIce: string;

  @IsString()
  @MaxLength(60)
  societeTp: string;

  @IsString()
  @MaxLength(255)
  societeAdresse: string;

  @IsString()
  @MaxLength(60)
  societeTelephone: string;

  @IsString()
  @MaxLength(120)
  societeEmail: string;
}

export class PropositionIntroductionDto {
  @IsString()
  @MaxLength(5000)
  paragraphe1: string;

  @IsString()
  @MaxLength(5000)
  paragraphe2: string;

  @Type(() => Number)
  @IsInt({ message: 'objectifProspects doit être un entier >= 1' })
  @Min(1, { message: 'objectifProspects doit être >= 1' })
  objectifProspects: number;
}

export class PropositionSection1Dto {
  @IsString()
  @MaxLength(5000)
  description: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  videosMin: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  videosMax: number;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  topics: string[];
}

export class PropositionSection2Dto {
  @IsString()
  @MaxLength(5000)
  texte: string;
}

export class PropositionSection3Dto {
  @IsString()
  @MaxLength(5000)
  intro: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  criteres: string[];

  @IsString()
  @MaxLength(5000)
  conclusion: string;
}

export class PropositionSection4Dto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  points: string[];

  @IsString()
  @MaxLength(2000)
  objectif: string;
}

export class PropositionStrategieDto {
  @ValidateNested()
  @Type(() => PropositionSection1Dto)
  section1CreationContenu: PropositionSection1Dto;

  @ValidateNested()
  @Type(() => PropositionSection2Dto)
  section2CampagnesPublicitaires: PropositionSection2Dto;

  @ValidateNested()
  @Type(() => PropositionSection3Dto)
  section3FunnelMarketing: PropositionSection3Dto;

  @ValidateNested()
  @Type(() => PropositionSection4Dto)
  section4Automatisation: PropositionSection4Dto;
}

export class PropositionTarifLigneDto {
  @IsString({ message: 'service requis' })
  @MaxLength(500)
  service: string;

  @IsString()
  @MaxLength(200)
  prixInitial: string;

  @IsString()
  @MaxLength(200)
  prixOffert: string;
}

export class PropositionTarifsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'au moins une ligne tarif est requise' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PropositionTarifLigneDto)
  lignes: PropositionTarifLigneDto[];

  @IsString()
  @MaxLength(2000)
  noteMetaAds: string;
}

export class PropositionContactDto {
  @IsString()
  @MaxLength(120)
  nom: string;

  @IsString()
  @MaxLength(60)
  telephone: string;

  @IsString()
  @MaxLength(120)
  email: string;

  @IsString()
  @MaxLength(200)
  tagline: string;
}

export class UpsertPropositionDto {
  @IsString({ message: 'titreProposition requis' })
  @MaxLength(300)
  titreProposition: string;

  @IsString({ message: 'preparePour requis' })
  @MaxLength(200)
  preparePour: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  clientNom?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  nomEtablissement?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  clientIce?: string;

  @IsString()
  @MaxLength(120)
  preparePar: string;

  @IsDateString({}, { message: 'dateEmission invalide (YYYY-MM-DD)' })
  dateEmission: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  propositionNumero?: string;

  @IsEmail({}, { message: 'clientEmail invalide' })
  @IsOptional()
  @MaxLength(120)
  clientEmail?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  clientTelephone?: string;

  @ValidateNested()
  @Type(() => PropositionEmetteurDto)
  emetteur: PropositionEmetteurDto;

  @ValidateNested()
  @Type(() => PropositionIntroductionDto)
  introduction: PropositionIntroductionDto;

  @ValidateNested()
  @Type(() => PropositionStrategieDto)
  strategie: PropositionStrategieDto;

  @ValidateNested()
  @Type(() => PropositionTarifsDto)
  tarifs: PropositionTarifsDto;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  pourquoiChoisir: string[];

  @IsString()
  @MaxLength(5000)
  prochainesEtapes: string;

  @ValidateNested()
  @Type(() => PropositionContactDto)
  contact: PropositionContactDto;
}
