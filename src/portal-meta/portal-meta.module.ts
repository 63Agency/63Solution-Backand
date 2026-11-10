import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { PortalLeadsModule } from '../portal-leads/portal-leads.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { MetaGraphService } from './meta-graph.service';
import { MetaOauthStateStore } from './meta-oauth-state.store';
import { MetaWebhookController } from './meta-webhook.controller';
import { MetaWebhookService } from './meta-webhook.service';
import { PortalMetaController } from './portal-meta.controller';
import { PortalMetaService } from './portal-meta.service';

@Module({
  imports: [SupabaseModule, ClientAuthModule, PortalLeadsModule],
  controllers: [PortalMetaController, MetaWebhookController],
  providers: [
    PortalMetaService,
    MetaGraphService,
    MetaOauthStateStore,
    MetaWebhookService,
  ],
  exports: [PortalMetaService, MetaGraphService],
})
export class PortalMetaModule {}
