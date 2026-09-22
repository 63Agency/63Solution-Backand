import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class AvailabilitySlotDto {
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'slots[].start doit être HH:mm',
  })
  start!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'slots[].end doit être HH:mm',
  })
  end!: string;
}

export class ListAvailabilitiesQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from doit être au format YYYY-MM-DD',
  })
  from?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to doit être au format YYYY-MM-DD',
  })
  to?: string;
}

export class UpsertAvailabilityDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date doit être au format YYYY-MM-DD',
  })
  date!: string;

  @IsString({ message: 'timezone requis' })
  @MinLength(1, { message: 'timezone requis' })
  @MaxLength(64, { message: 'timezone trop long' })
  timezone!: string;

  @IsArray({ message: 'slots doit être un tableau' })
  @ArrayMinSize(1, { message: 'au moins un créneau requis' })
  @ArrayMaxSize(24, { message: 'slots max 24' })
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  slots!: AvailabilitySlotDto[];
}
