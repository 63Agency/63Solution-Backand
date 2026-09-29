import { IsString, MinLength, MaxLength } from 'class-validator';

/** PATCH /users/me/timezone — utilisateur courant. */
export class UpdateTimezoneDto {
  @IsString({ message: 'timezone requis' })
  @MinLength(1, { message: 'timezone requis' })
  @MaxLength(64, { message: 'timezone trop long' })
  timezone!: string;
}
