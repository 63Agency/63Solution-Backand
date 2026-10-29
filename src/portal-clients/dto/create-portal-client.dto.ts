import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreatePortalClientDto {
  @IsString({ message: 'companyName requis' })
  @IsNotEmpty({ message: 'companyName requis' })
  companyName!: string;

  @IsEmail({}, { message: 'email invalide' })
  email!: string;

  @IsString({ message: 'mot de passe requis' })
  @MinLength(8, { message: 'mot de passe: au moins 8 caractères' })
  password!: string;
}
