import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** PATCH /users/:id — admin only. Tous les champs optionnels. */
export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'prénom invalide' })
  @MinLength(1, { message: 'prénom requis' })
  prenom?: string;

  @IsOptional()
  @IsString({ message: 'nom invalide' })
  @MinLength(1, { message: 'nom requis' })
  nom?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  telephone?: string | null;

  @IsOptional()
  @IsString()
  ville?: string | null;

  @IsOptional()
  @IsIn(['admin', 'admin_whatsapp', 'fixed_meeting'], {
    message: 'role doit être admin, admin_whatsapp ou fixed_meeting',
  })
  role?: 'admin' | 'admin_whatsapp' | 'fixed_meeting';

  /** Si fourni, remplace le mot de passe (hash bcrypt). */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'mot de passe: au moins 8 caractères' })
  password?: string;

  /** URL http(s) ou chaîne vide / null pour supprimer. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string | null;
}
