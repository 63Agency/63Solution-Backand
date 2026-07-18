-- Allow Cloudinary raw documents in media_files.
alter table public.media_files
  drop constraint if exists media_files_resource_type_check;

alter table public.media_files
  add constraint media_files_resource_type_check
  check (resource_type in ('image', 'video', 'raw'));
