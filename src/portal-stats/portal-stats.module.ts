import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import {
  PortalActivityController,
  PortalStatsController,
} from './portal-stats.controller';
import { PortalStatsService } from './portal-stats.service';

@Module({
  imports: [SupabaseModule, ClientAuthModule],
  controllers: [PortalStatsController, PortalActivityController],
  providers: [PortalStatsService],
  exports: [PortalStatsService],
})
export class PortalStatsModule {}
