import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [SupabaseModule, RealtimeModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
