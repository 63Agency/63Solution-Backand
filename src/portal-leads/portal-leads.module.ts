import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { PortalTasksModule } from '../portal-tasks/portal-tasks.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PortalLeadsController } from './portal-leads.controller';
import { PortalLeadsService } from './portal-leads.service';

@Module({
  imports: [SupabaseModule, ClientAuthModule, PortalTasksModule],
  controllers: [PortalLeadsController],
  providers: [PortalLeadsService],
  exports: [PortalLeadsService],
})
export class PortalLeadsModule {}
