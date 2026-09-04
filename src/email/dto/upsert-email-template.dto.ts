import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertEmailTemplateDto {
  @IsString({ message: 'subject requis' })
  @MinLength(1, { message: 'subject requis' })
  @MaxLength(500, { message: 'subject trop long' })
  subject!: string;

  @IsString({ message: 'html_body requis' })
  @MinLength(1, { message: 'html_body requis' })
  @MaxLength(200_000, { message: 'html_body trop long' })
  html_body!: string;
}
