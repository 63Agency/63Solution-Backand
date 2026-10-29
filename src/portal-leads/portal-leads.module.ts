import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PortalLeadsController } from './portal-leads.controller';
import { PortalLeadsService } from './portal-leads.service';

@Module({
  imports: [SupabaseModule, ClientAuthModule],
  controllers: [PortalLeadsController],
  providers: [PortalLeadsService],
  exports: [PortalLeadsService],
})
export class PortalLeadsModule {}
