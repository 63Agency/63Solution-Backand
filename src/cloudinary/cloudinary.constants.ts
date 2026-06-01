export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const MULTIPLE_MAX_FILES = 10;

export const ALLOWED_IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
] as const;

export const ALLOWED_VIDEO_EXTENSIONS = [
  'mp4',
  'mov',
  'avi',
  'mkv',
] as const;

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
]);

export const RESPONSIVE_WIDTHS = [320, 640, 1024, 1920] as const;

export const DEFAULT_UPLOAD_FOLDER = '63agency';
