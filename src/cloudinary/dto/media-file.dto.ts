export class MediaFileDto {
  id!: string;
  publicId!: string;
  secureUrl!: string;
  resourceType!: 'image' | 'video';
  format!: string | null;
  width!: number | null;
  height!: number | null;
  duration!: number | null;
  folder!: string | null;
  userId!: string;
  createdAt!: string;
}
