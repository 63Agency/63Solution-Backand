import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** POST /leads/:id/email — au moins bodyHtml ou bodyText (validé au service). */
export class SendLeadEmailDto {
  @IsString({ message: 'subject requis' })
  @IsNotEmpty({ message: 'subject requis' })
  @MaxLength(998)
  subject!: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;
}
