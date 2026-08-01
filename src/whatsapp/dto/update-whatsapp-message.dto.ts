import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateWhatsappMessageDto {
  @IsString({ message: 'text requis' })
  @MinLength(1, { message: 'text requis' })
  @MaxLength(4096, { message: 'text max 4096 caractères' })
  text!: string;
}
