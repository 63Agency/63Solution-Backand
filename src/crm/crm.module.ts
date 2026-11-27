import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CrmLeadsController } from './leads/crm-leads.controller';
import { CrmLeadsService } from './leads/crm-leads.service';
import { CrmNichesController } from './niches/crm-niches.controller';
import { CrmNichesService } from './niches/crm-niches.service';

/**
 * CRM overlay (Team Workspace) — préfixe /crm.
 * N'altère pas /leads (Solution) ni clickup_leads (hors insert manuel).
 */
@Module({
  imports: [SupabaseModule],
  controllers: [CrmLeadsController, CrmNichesController],
  providers: [CrmLeadsService, CrmNichesService],
  exports: [CrmLeadsService, CrmNichesService],
})
export class CrmModule {}
