import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'email invalide' })
  email: string;

  @IsString({ message: 'mot de passe requis' })
  @MinLength(8, { message: 'mot de passe: au moins 8 caractères' })
  password: string;
}
