import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PortalTasksController } from './portal-tasks.controller';
import { PortalTasksService } from './portal-tasks.service';

@Module({
  imports: [SupabaseModule, ClientAuthModule],
  controllers: [PortalTasksController],
  providers: [PortalTasksService],
  exports: [PortalTasksService],
})
export class PortalTasksModule {}
