import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadFolderQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  folder?: string;
}
