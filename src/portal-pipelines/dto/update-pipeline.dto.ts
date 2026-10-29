import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePipelineDto {
  @IsOptional()
  @IsString({ message: 'name invalide' })
  @IsNotEmpty({ message: 'name invalide' })
  @MaxLength(200, { message: 'name trop long' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'color invalide' })
  @IsNotEmpty({ message: 'color invalide' })
  @MaxLength(60, { message: 'color trop long' })
  color?: string;
}
