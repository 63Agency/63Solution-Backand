import { IsBoolean } from 'class-validator';

export class UpdateMetaFormDto {
  @IsBoolean({ message: 'is_linked doit être un booléen' })
  is_linked!: boolean;
}
