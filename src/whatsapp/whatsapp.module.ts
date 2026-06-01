import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { MetaService } from './meta.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappPublicController } from './whatsapp-public.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [SupabaseModule, NotificationsModule],
  controllers: [
    WhatsappController,
    WhatsappPublicController,
    WhatsappWebhookController,
  ],
  providers: [WhatsappService, MetaService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
