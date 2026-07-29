import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';

export class ReminderChannelFlagsDto {
  @IsOptional()
  @IsBoolean({ message: '2d doit être un booléen' })
  '2d'?: boolean;

  @IsOptional()
  @IsBoolean({ message: '24h doit être un booléen' })
  '24h'?: boolean;

  @IsOptional()
  @IsBoolean({ message: '2h doit être un booléen' })
  '2h'?: boolean;
}

export class MeetingRemindersDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderChannelFlagsDto)
  whatsapp?: ReminderChannelFlagsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderChannelFlagsDto)
  email?: ReminderChannelFlagsDto;
}
