import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AdminActivityService } from './admin-activity.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [SupabaseModule],
  controllers: [AdminController],
  providers: [AdminActivityService],
})
export class AdminModule {}
