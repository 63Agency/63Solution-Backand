import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PortalTeamController } from './portal-team.controller';
import { PortalTeamService } from './portal-team.service';

@Module({
  imports: [SupabaseModule, ClientAuthModule],
  controllers: [PortalTeamController],
  providers: [PortalTeamService],
  exports: [PortalTeamService],
})
export class PortalTeamModule {}
