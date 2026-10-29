import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePipelineDto {
  @IsString({ message: 'name requis' })
  @IsNotEmpty({ message: 'name requis' })
  @MaxLength(200, { message: 'name trop long' })
  name!: string;

  /** Défaut serveur / DB : gold. */
  @IsOptional()
  @IsString({ message: 'color invalide' })
  @IsNotEmpty({ message: 'color invalide' })
  @MaxLength(60, { message: 'color trop long' })
  color?: string;
}
