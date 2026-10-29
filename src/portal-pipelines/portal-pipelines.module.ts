import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PortalPipelinesController } from './portal-pipelines.controller';
import { PortalPipelinesService } from './portal-pipelines.service';

@Module({
  imports: [SupabaseModule, ClientAuthModule],
  controllers: [PortalPipelinesController],
  providers: [PortalPipelinesService],
  exports: [PortalPipelinesService],
})
export class PortalPipelinesModule {}
