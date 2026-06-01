import { IsOptional, IsString } from 'class-validator';
import { TransformationOptionsDto } from './transformation-options.dto';

export class TransformQueryDto extends TransformationOptionsDto {
  @IsOptional()
  @IsString()
  publicId?: string;
}
