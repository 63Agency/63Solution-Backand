import type { MediaFileDto } from './media-file.dto';

export class UploadResponseDto {
  publicId!: string;
  secureUrl!: string;
  resourceType!: 'image' | 'video' | 'raw';
  format!: string;
  width!: number | null;
  height!: number | null;
  duration!: number | null;
  folder!: string;
  optimizedUrl!: string;
  thumbnailUrl!: string | null;
  media!: MediaFileDto;
}

export class MultipleUploadResponseDto {
  items!: UploadResponseDto[];
}

export class TransformUrlResponseDto {
  publicId!: string;
  url!: string;
  thumbnailUrl!: string | null;
  breakpoints!: { width: number; url: string }[];
}
