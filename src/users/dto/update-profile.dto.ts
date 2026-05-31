import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsString({ message: 'prénom requis' })
  @IsNotEmpty({ message: 'prénom requis' })
  prenom: string;

  @IsString({ message: 'nom requis' })
  @IsNotEmpty({ message: 'nom requis' })
  nom: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  ville?: string;
}
