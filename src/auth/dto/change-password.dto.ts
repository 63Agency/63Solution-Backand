import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString({ message: 'mot de passe actuel requis' })
  currentPassword: string;

  @IsString({ message: 'nouveau mot de passe requis' })
  @MinLength(8, { message: 'nouveau mot de passe: au moins 8 caractères' })
  newPassword: string;
}
