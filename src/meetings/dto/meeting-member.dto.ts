import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

export class MeetingMemberDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4', { message: 'userId invalide' })
  userId?: string;

  @IsString({ message: 'members[].name requis' })
  @MinLength(1, { message: 'members[].name requis' })
  @MaxLength(200, { message: 'members[].name trop long' })
  name!: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'members[].phone invalide' })
  @MaxLength(30, { message: 'members[].phone trop long' })
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEmail({}, { message: 'members[].email invalide' })
  @MaxLength(120, { message: 'members[].email trop long' })
  email?: string;
}
