import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined;
  return v;
}

/** Participant côté client (autre lead), distinct du contact principal. */
export class MeetingMemberDto {
  /** Id lead ClickUp (text) — optionnel. */
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString({ message: 'leadId invalide' })
  @MaxLength(128, { message: 'leadId trop long' })
  leadId?: string;

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
