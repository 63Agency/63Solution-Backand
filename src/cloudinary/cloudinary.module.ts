import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CloudinaryController } from './cloudinary.controller';
import { CloudinaryService } from './cloudinary.service';
import { MediaFilesService } from './media-files.service';

@Module({
  imports: [SupabaseModule],
  controllers: [CloudinaryController],
  providers: [CloudinaryService, MediaFilesService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
