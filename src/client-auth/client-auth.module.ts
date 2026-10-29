import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { ClientJwtGuard } from './client-jwt.guard';
import { ClientJwtStrategy } from './client-jwt.strategy';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [ClientAuthController],
  providers: [ClientAuthService, ClientJwtStrategy, ClientJwtGuard],
  exports: [ClientAuthService, ClientJwtGuard],
})
export class ClientAuthModule {}
