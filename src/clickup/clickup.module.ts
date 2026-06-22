import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ClickupController } from './clickup.controller';
import { ClickupService } from './clickup.service';

@Module({
  imports: [SupabaseModule],
  controllers: [ClickupController],
  providers: [ClickupService],
  exports: [ClickupService],
})
export class ClickupModule {}
