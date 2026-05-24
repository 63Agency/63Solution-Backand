import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { MetaService } from './meta.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [SupabaseModule],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [WhatsappService, MetaService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
