import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ClickupModule } from './clickup/clickup.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { ClientsModule } from './clients/clients.module';
import { DevisModule } from './devis/devis.module';
import { FacturesModule } from './factures/factures.module';
import { MeetingsModule } from './meetings/meetings.module';
import { PropositionsModule } from './propositions/propositions.module';
import { SupabaseModule } from './supabase/supabase.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    SupabaseModule,
    AuthModule,
    ClickupModule,
    CloudinaryModule,
    ClientsModule,
    DevisModule,
    FacturesModule,
    PropositionsModule,
    MeetingsModule,
    UsersModule,
    NotificationsModule,
    WhatsappModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
