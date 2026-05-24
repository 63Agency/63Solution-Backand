import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WhatsappService } from './whatsapp.service';

@SkipThrottle()
@Controller('whatsapp/webhooks')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private readonly whatsapp: WhatsappService) {}

  @Post('wati')
  @HttpCode(HttpStatus.OK)
  receiveWati(@Body() body: Record<string, unknown>) {
    void this.whatsapp.handleWatiWebhook(body ?? {}).catch((err: Error) => {
      this.logger.error(`Webhook Wati: ${err.message}`, err.stack);
    });
    return { ok: true };
  }
}
