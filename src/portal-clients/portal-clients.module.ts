import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { PortalClientsController } from './portal-clients.controller';
import { PortalClientsService } from './portal-clients.service';

@Module({
  imports: [SupabaseModule],
  controllers: [PortalClientsController],
  providers: [PortalClientsService],
  exports: [PortalClientsService],
})
export class PortalClientsModule {}
