import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  type DeleteApiResponse,
  type UploadApiOptions,
  type UploadApiResponse,
} from 'cloudinary';
import type { AppUser } from '../auth/types/app-user';
import {
  DEFAULT_UPLOAD_FOLDER,
  RESPONSIVE_WIDTHS,
} from './cloudinary.constants';
import type { MediaFileDto } from './dto/media-file.dto';
import type { TransformUrlResponseDto } from './dto/upload-response.dto';
import type { TransformationOptionsDto } from './dto/transformation-options.dto';
import type { UploadResponseDto } from './dto/upload-response.dto';
import { MediaFilesService } from './media-files.service';
import { detectUploadKind } from './utils/multer-options';

@Injectable()
export class CloudinaryService implements OnModuleInit {
  private readonly logger = new Logger(CloudinaryService.name);
  private configured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly mediaFiles: MediaFilesService,
  ) {}

  onModuleInit(): void {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.warn(
        'Cloudinary non configuré (CLOUDINARY_* manquant dans .env)',
      );
      return;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
    this.configured = true;
    this.logger.log('Cloudinary configuré');
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException({
        message: 'Cloudinary non configuré sur le serveur.',
      });
    }
  }

  private normalizeFolder(folder?: string): string {
    const raw = (folder ?? DEFAULT_UPLOAD_FOLDER).trim() || DEFAULT_UPLOAD_FOLDER;
    return raw.replace(/^\/+|\/+$/g, '');
  }

  private uploadBuffer(
    buffer: Buffer,
    options: UploadApiOptions,
  ): Promise<UploadApiResponse> {
    this.assertConfigured();
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
        if (err) reject(err);
        else if (!result) reject(new Error('Upload Cloudinary sans résultat'));
        else resolve(result);
      });
      stream.end(buffer);
    });
  }

  /**
   * Upload inbound WhatsApp media (from Meta download) to Cloudinary.
   * Does not require a logged-in user / media_files row.
   */
  async uploadWhatsAppInboundBuffer(
    buffer: Buffer,
    options: {
      resourceType: 'image' | 'video' | 'raw';
      folder?: string;
      fileName?: string;
      mimeType?: string;
    },
  ): Promise<{
    secureUrl: string;
    publicId: string;
    bytes: number | null;
    resourceType: 'image' | 'video' | 'raw';
  }> {
    if (!buffer?.length) {
      throw new BadRequestException({ message: 'Buffer média vide' });
    }
    const folder = this.normalizeFolder(
      options.folder ?? `${DEFAULT_UPLOAD_FOLDER}/whatsapp/inbound`,
    );
    const baseName = (options.fileName ?? 'media')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 80) || 'media';

    const result = await this.uploadBuffer(buffer, {
      folder,
      resource_type: options.resourceType,
      use_filename: true,
      unique_filename: true,
      filename_override: baseName,
    });

    const resourceType =
      result.resource_type === 'video'
        ? 'video'
        : result.resource_type === 'raw'
          ? 'raw'
          : 'image';

    // Prefer Cloudinary secure_url for inbound WA media (esp. audio/ogg voice notes).
    return {
      secureUrl: result.secure_url,
      publicId: result.public_id,
      bytes: typeof result.bytes === 'number' ? result.bytes : buffer.length,
      resourceType,
    };
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadApiResponse> {
    if (!file?.buffer?.length) {
      throw new BadRequestException({ message: 'Fichier image requis' });
    }
    return this.uploadBuffer(file.buffer, {
      folder: this.normalizeFolder(folder),
      resource_type: 'image',
      format: undefined,
    });
  }

  async uploadVideo(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadApiResponse> {
    if (!file?.buffer?.length) {
      throw new BadRequestException({ message: 'Fichier vidéo requis' });
    }
    return this.uploadBuffer(file.buffer, {
      folder: this.normalizeFolder(folder),
      resource_type: 'video',
    });
  }

  async uploadRaw(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadApiResponse> {
    if (!file?.buffer?.length) {
      throw new BadRequestException({ message: 'Fichier requis' });
    }
    const original = file.originalname?.trim() || 'document';
    return this.uploadBuffer(file.buffer, {
      folder: this.normalizeFolder(folder),
      resource_type: 'raw',
      public_id: undefined,
      use_filename: true,
      unique_filename: true,
      filename_override: original.replace(/\.[^/.]+$/, '') || 'document',
    });
  }

  async deleteFile(publicId: string): Promise<DeleteApiResponse> {
    this.assertConfigured();
    const stored = await this.mediaFiles.findByPublicId(publicId);
    const resourceType = stored?.resourceType ?? 'image';
    return cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
  }

  getOptimizedUrl(
    publicId: string,
    transformations: Record<string, unknown> = {},
    resourceType: 'image' | 'video' = 'image',
  ): string {
    this.assertConfigured();
    const base: Record<string, unknown> = {
      fetch_format: 'auto',
      quality: 'auto',
      ...transformations,
    };
    return cloudinary.url(publicId, {
      secure: true,
      resource_type: resourceType,
      transformation: [base],
    });
  }

  generateThumbnail(videoPublicId: string): string {
    this.assertConfigured();
    return cloudinary.url(videoPublicId, {
      secure: true,
      resource_type: 'video',
      transformation: [
        { width: 640, height: 360, crop: 'fill', gravity: 'auto' },
        { start_offset: '0', format: 'jpg', quality: 'auto' },
      ],
    });
  }

  buildTransformResponse(
    publicId: string,
    resourceType: 'image' | 'video',
    options?: TransformationOptionsDto,
  ): TransformUrlResponseDto {
    const custom: Record<string, unknown> = {};
    if (options?.width) custom.width = options.width;
    if (options?.height) custom.height = options.height;
    if (options?.crop) custom.crop = options.crop;
    if (options?.gravity) custom.gravity = options.gravity;
    if (options?.format) custom.fetch_format = options.format;
    if (options?.quality) {
      custom.quality = options.quality === 'auto' ? 'auto' : options.quality;
    }

    const url = this.getOptimizedUrl(publicId, custom, resourceType);
    const breakpoints =
      resourceType === 'image'
        ? RESPONSIVE_WIDTHS.map((width) => ({
            width,
            url: this.getOptimizedUrl(
              publicId,
              { ...custom, width, crop: custom.crop ?? 'limit' },
              'image',
            ),
          }))
        : [];

    return {
      publicId,
      url,
      thumbnailUrl:
        resourceType === 'video' ? this.generateThumbnail(publicId) : null,
      breakpoints,
    };
  }

  private toUploadResponse(
    result: UploadApiResponse,
    media: MediaFileDto,
    folder: string,
  ): UploadResponseDto {
    const resourceType =
      result.resource_type === 'video'
        ? 'video'
        : result.resource_type === 'raw'
          ? 'raw'
          : 'image';
    const optimizedUrl =
      resourceType === 'raw'
        ? result.secure_url
        : this.getOptimizedUrl(result.public_id, {}, resourceType);
    const thumbnailUrl =
      resourceType === 'video'
        ? this.generateThumbnail(result.public_id)
        : null;

    return {
      publicId: result.public_id,
      secureUrl: result.secure_url,
      resourceType,
      format: String(result.format ?? ''),
      width: result.width ?? null,
      height: result.height ?? null,
      duration: result.duration ?? null,
      folder,
      optimizedUrl,
      thumbnailUrl,
      media,
    };
  }

  async persistUpload(
    result: UploadApiResponse,
    user: AppUser,
    folder: string,
  ): Promise<UploadResponseDto> {
    const normalizedFolder = this.normalizeFolder(folder);
    const media = await this.mediaFiles.saveFromCloudinary(
      result,
      user.id,
      normalizedFolder,
    );
    return this.toUploadResponse(result, media, normalizedFolder);
  }

  async uploadAndSaveImage(
    file: Express.Multer.File,
    user: AppUser,
    folder?: string,
  ): Promise<UploadResponseDto> {
    const f = this.normalizeFolder(folder);
    const result = await this.uploadImage(file, f);
    return this.persistUpload(result, user, f);
  }

  async uploadAndSaveVideo(
    file: Express.Multer.File,
    user: AppUser,
    folder?: string,
  ): Promise<UploadResponseDto> {
    const f = this.normalizeFolder(folder);
    const result = await this.uploadVideo(file, f);
    return this.persistUpload(result, user, f);
  }

  async uploadAndSaveRaw(
    file: Express.Multer.File,
    user: AppUser,
    folder?: string,
  ): Promise<UploadResponseDto> {
    const f = this.normalizeFolder(folder);
    const result = await this.uploadRaw(file, f);
    try {
      return await this.persistUpload(result, user, f);
    } catch (err) {
      this.logger.warn(
        `media_files persist raw failed — returning Cloudinary URL only: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      const media: MediaFileDto = {
        id: result.public_id,
        publicId: result.public_id,
        secureUrl: result.secure_url,
        resourceType: 'raw',
        format: result.format ? String(result.format) : null,
        width: null,
        height: null,
        duration: null,
        folder: f,
        userId: user.id,
        createdAt: new Date().toISOString(),
      };
      return this.toUploadResponse(result, media, f);
    }
  }

  async uploadAndSaveMultiple(
    files: Express.Multer.File[],
    user: AppUser,
    folder?: string,
  ): Promise<UploadResponseDto[]> {
    if (!files?.length) {
      throw new BadRequestException({ message: 'Au moins un fichier requis' });
    }
    const f = this.normalizeFolder(folder);
    const items: UploadResponseDto[] = [];
    for (const file of files) {
      const kind = detectUploadKind(file);
      const result =
        kind === 'image'
          ? await this.uploadImage(file, f)
          : await this.uploadVideo(file, f);
      items.push(await this.persistUpload(result, user, f));
    }
    return items;
  }

  async removeForUser(publicId: string, user: AppUser): Promise<{ ok: true }> {
    const decoded = decodeURIComponent(publicId).trim();
    if (!decoded) {
      throw new BadRequestException({ message: 'publicId requis' });
    }
    await this.deleteFile(decoded);
    await this.mediaFiles.deleteByPublicId(decoded, user.id);
    return { ok: true };
  }

  async listMedia(user: AppUser, folder?: string): Promise<MediaFileDto[]> {
    return this.mediaFiles.listForUser(user.id, folder);
  }

  async getTransform(
    publicId: string,
    options?: TransformationOptionsDto,
  ): Promise<TransformUrlResponseDto> {
    const decoded = decodeURIComponent(publicId).trim();
    const stored = await this.mediaFiles.findByPublicId(decoded);
    const resourceType =
      stored?.resourceType === 'video' ? 'video' : 'image';
    return this.buildTransformResponse(decoded, resourceType, options);
  }
}
