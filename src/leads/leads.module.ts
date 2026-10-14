import { Module } from '@nestjs/common';
import { ClickupModule } from '../clickup/clickup.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [ClickupModule, SupabaseModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
