import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ClickupController } from './clickup.controller';
import { ClickupService } from './clickup.service';

@Module({
  imports: [SupabaseModule, RealtimeModule],
  controllers: [ClickupController],
  providers: [ClickupService],
  exports: [ClickupService],
})
export class ClickupModule {}
