import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  /** IANA timezone (ex. Asia/Ho_Chi_Minh). Validé côté service. */
  @IsOptional()
  @IsString({ message: 'timezone invalide' })
  @MinLength(1, { message: 'timezone requis' })
  @MaxLength(64, { message: 'timezone trop long' })
  timezone?: string;
}
