import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString({ message: 'prénom requis' })
  @IsNotEmpty({ message: 'prénom requis' })
  prenom!: string;

  @IsString({ message: 'nom requis' })
  @IsNotEmpty({ message: 'nom requis' })
  nom!: string;

  @IsEmail({}, { message: 'email invalide' })
  email!: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  ville?: string;

  @IsString({ message: 'mot de passe requis' })
  @MinLength(8, { message: 'mot de passe: au moins 8 caractères' })
  password!: string;

  @IsIn(['admin', 'admin_whatsapp', 'fixed_meeting'], {
    message: 'role doit être admin, admin_whatsapp ou fixed_meeting',
  })
  role!: 'admin' | 'admin_whatsapp' | 'fixed_meeting';
}
