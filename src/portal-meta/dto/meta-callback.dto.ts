import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class MetaCallbackDto {
  @IsString({ message: 'code requis' })
  @IsNotEmpty({ message: 'code requis' })
  @MaxLength(2000)
  code!: string;

  @IsString({ message: 'state requis' })
  @IsNotEmpty({ message: 'state requis' })
  @MaxLength(200)
  state!: string;
}
