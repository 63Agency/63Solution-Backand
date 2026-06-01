import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /** URL HTTPS (ex. Cloudinary). Chaîne vide ou `null` pour supprimer la photo. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string | null;
}
