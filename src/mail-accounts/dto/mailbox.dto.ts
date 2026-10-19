import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
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

export class MailboxAttachmentQueryDto {
  @IsOptional()
  @IsString()
  folder?: string;

  @Type(() => Number)
  @IsInt({ message: 'index invalide' })
  @Min(0, { message: 'index invalide' })
  index!: number;
}

export class MailboxOutgoingAttachmentDto {
  @IsString({ message: 'filename requis' })
  @IsNotEmpty({ message: 'filename requis' })
  @MaxLength(255)
  filename!: string;

  @IsString({ message: 'contentType requis' })
  @IsNotEmpty({ message: 'contentType requis' })
  @MaxLength(200)
  contentType!: string;

  @IsString({ message: 'contentBase64 requis' })
  @IsNotEmpty({ message: 'contentBase64 requis' })
  contentBase64!: string;
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MailboxOutgoingAttachmentDto)
  attachments?: MailboxOutgoingAttachmentDto[];
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MailboxOutgoingAttachmentDto)
  attachments?: MailboxOutgoingAttachmentDto[];
}
