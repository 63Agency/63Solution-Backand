import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { MetaGraphService } from './meta-graph.service';
import { MetaOauthStateStore } from './meta-oauth-state.store';
import { PortalMetaController } from './portal-meta.controller';
import { PortalMetaService } from './portal-meta.service';

@Module({
  imports: [SupabaseModule, ClientAuthModule],
  controllers: [PortalMetaController],
  providers: [PortalMetaService, MetaGraphService, MetaOauthStateStore],
  exports: [PortalMetaService, MetaGraphService],
})
export class PortalMetaModule {}
