import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UploadApiResponse } from 'cloudinary';
import { SupabaseService } from '../supabase/supabase.service';
import type { MediaFileDto } from './dto/media-file.dto';
import { DEFAULT_UPLOAD_FOLDER } from './cloudinary.constants';

type MediaFileRow = {
  id: string;
  public_id: string;
  secure_url: string;
  resource_type: string;
  format: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  folder: string | null;
  user_id: string;
  created_at: string;
};

function mapMediaFile(row: MediaFileRow): MediaFileDto {
  return {
    id: String(row.id),
    publicId: String(row.public_id),
    secureUrl: String(row.secure_url),
    resourceType: row.resource_type as 'image' | 'video',
    format: row.format ? String(row.format) : null,
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    duration: row.duration != null ? Number(row.duration) : null,
    folder: row.folder ? String(row.folder) : null,
    userId: String(row.user_id),
    createdAt: String(row.created_at),
  };
}

@Injectable()
export class MediaFilesService {
  constructor(private readonly supabase: SupabaseService) {}

  async saveFromCloudinary(
    result: UploadApiResponse,
    userId: string,
    folder: string,
  ): Promise<MediaFileDto> {
    const resourceType =
      result.resource_type === 'video' ? 'video' : 'image';
    const row = {
      public_id: result.public_id,
      secure_url: result.secure_url,
      resource_type: resourceType,
      format: result.format ?? null,
      width: result.width ?? null,
      height: result.height ?? null,
      duration: result.duration ?? null,
      folder: folder || DEFAULT_UPLOAD_FOLDER,
      user_id: userId,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .getClient()
      .from('media_files')
      .insert(row)
      .select('*')
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Enregistrement média impossible',
      });
    }
    return mapMediaFile(data as MediaFileRow);
  }

  async findByPublicId(publicId: string): Promise<MediaFileDto | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from('media_files')
      .select('*')
      .eq('public_id', publicId)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    return data ? mapMediaFile(data as MediaFileRow) : null;
  }

  async listForUser(userId: string, folder?: string): Promise<MediaFileDto[]> {
    let query = this.supabase
      .getClient()
      .from('media_files')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (folder?.trim()) {
      query = query.eq('folder', folder.trim());
    }

    const { data, error } = await query;
    if (error) {
      throw new ConflictException({ message: error.message });
    }
    return (data ?? []).map((r) => mapMediaFile(r as MediaFileRow));
  }

  async deleteByPublicId(publicId: string, userId: string): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from('media_files')
      .delete()
      .eq('public_id', publicId)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data?.length) {
      throw new NotFoundException({ message: 'Fichier introuvable' });
    }
  }
}
