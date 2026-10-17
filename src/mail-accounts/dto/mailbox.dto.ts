import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListMailboxMessagesQueryDto {
  @IsOptional()
  @IsString()
  folder?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class MailboxFolderQueryDto {
  @IsOptional()
  @IsString()
  folder?: string;
}

export class MarkSeenDto {
  @IsOptional()
  @IsString()
  folder?: string;
}

export class SendMailboxDto {
  @IsString({ message: 'to requis' })
  @IsNotEmpty({ message: 'to requis' })
  to!: string;

  @IsString({ message: 'subject requis' })
  @IsNotEmpty({ message: 'subject requis' })
  @MaxLength(998)
  subject!: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;
}

export class ReplyMailboxDto {
  @IsOptional()
  @IsString()
  folder?: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;
}
