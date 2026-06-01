import { IsString, MinLength } from 'class-validator';

export class DeleteMediaQueryDto {
  @IsString()
  @MinLength(1)
  publicId!: string;
}
