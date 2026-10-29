import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTeamMemberDto {
  @IsString({ message: 'name requis' })
  @IsNotEmpty({ message: 'name requis' })
  @MaxLength(200, { message: 'name trop long' })
  name!: string;

  @IsEmail({}, { message: 'email invalide' })
  email!: string;

  @IsString({ message: 'mot de passe requis' })
  @MinLength(8, { message: 'mot de passe: au moins 8 caractères' })
  password!: string;
}
