import { IsEmail, IsString, MinLength } from 'class-validator';

export class ClientLoginDto {
  @IsEmail({}, { message: 'email invalide' })
  email!: string;

  @IsString({ message: 'mot de passe requis' })
  @MinLength(1, { message: 'mot de passe requis' })
  password!: string;
}
