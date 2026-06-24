import {
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BroadcastWhatsappMessageDto {
  @IsArray({ message: 'phoneNumbers doit être un tableau' })
  @ArrayMinSize(1, { message: 'au moins un numéro requis' })
  @IsString({ each: true, message: 'chaque numéro doit être une chaîne' })
  phoneNumbers: string[];

  @IsString({ message: 'text requis' })
  @MinLength(1, { message: 'text requis' })
  @MaxLength(4096, { message: 'text max 4096 caractères' })
  text: string;
}
