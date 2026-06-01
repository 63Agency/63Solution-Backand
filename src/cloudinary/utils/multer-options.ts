import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_MIMES,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
} from '../cloudinary.constants';

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

function isAllowedExtension(ext: string, kind: 'image' | 'video'): boolean {
  const list =
    kind === 'image'
      ? (ALLOWED_IMAGE_EXTENSIONS as readonly string[])
      : (ALLOWED_VIDEO_EXTENSIONS as readonly string[]);
  return list.includes(ext);
}

function assertFileKind(
  file: Pick<Express.Multer.File, 'originalname' | 'mimetype'>,
  kind: 'image' | 'video',
): void {
  const ext = extensionOf(file.originalname);
  const allowedMime =
    kind === 'image' ? ALLOWED_IMAGE_MIMES : ALLOWED_VIDEO_MIMES;

  if (!isAllowedExtension(ext, kind)) {
    const allowedExt =
      kind === 'image' ? ALLOWED_IMAGE_EXTENSIONS : ALLOWED_VIDEO_EXTENSIONS;
    throw new BadRequestException({
      message: `Extension non autorisée (.${ext}). Autorisé: ${allowedExt.join(', ')}`,
    });
  }
  if (!allowedMime.has(file.mimetype)) {
    throw new BadRequestException({
      message: `Type MIME non autorisé (${file.mimetype}).`,
    });
  }
}

export function multerOptionsFor(kind: 'image' | 'video'): MulterOptions {
  const maxSize = kind === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxSize, files: 1 },
    fileFilter: (_req, file, cb) => {
      try {
        assertFileKind(file, kind);
        cb(null, true);
      } catch (err) {
        cb(err as Error, false);
      }
    },
  };
}

export function multerOptionsForMultiple(): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: {
      fileSize: VIDEO_MAX_BYTES,
      files: 10,
    },
    fileFilter: (_req, file, cb) => {
      const ext = extensionOf(file.originalname);
      const isImage = (ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(
        ext,
      );
      const isVideo = (ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(
        ext,
      );
      if (!isImage && !isVideo) {
        cb(
          new BadRequestException({
            message: `Extension non autorisée (.${ext}).`,
          }),
          false,
        );
        return;
      }
      const mimeOk =
        ALLOWED_IMAGE_MIMES.has(file.mimetype) ||
        ALLOWED_VIDEO_MIMES.has(file.mimetype);
      if (!mimeOk) {
        cb(
          new BadRequestException({
            message: `Type MIME non autorisé (${file.mimetype}).`,
          }),
          false,
        );
        return;
      }
      const max =
        isImage && ALLOWED_IMAGE_MIMES.has(file.mimetype)
          ? IMAGE_MAX_BYTES
          : VIDEO_MAX_BYTES;
      if (file.size && file.size > max) {
        cb(
          new BadRequestException({
            message: `Fichier trop volumineux (max ${isImage ? '10' : '100'} Mo).`,
          }),
          false,
        );
        return;
      }
      cb(null, true);
    },
  };
}

export function detectUploadKind(
  file: Express.Multer.File,
): 'image' | 'video' {
  const ext = extensionOf(file.originalname);
  if ((ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    return 'image';
  }
  if ((ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) {
    return 'video';
  }
  throw new BadRequestException({ message: 'Type de fichier non reconnu.' });
}
