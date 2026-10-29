import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateLeadNoteDto {
  @IsString({ message: 'body requis' })
  @IsNotEmpty({ message: 'body requis' })
  @MaxLength(5000, { message: 'body trop long' })
  body!: string;
}
