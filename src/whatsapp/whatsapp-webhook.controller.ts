import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WhatsappService } from './whatsapp.service';

@SkipThrottle()
@Controller('whatsapp/webhooks')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private readonly whatsapp: WhatsappService) {}

  /** Vérification webhook Meta (hub challenge). */
  @Get('meta')
  @HttpCode(HttpStatus.OK)
  verifyMeta(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const ok = this.whatsapp.verifyMetaWebhook(mode, verifyToken, challenge);
    if (!ok) {
      throw new ForbiddenException({ message: 'Verify token invalide' });
    }
    return ok;
  }

  /** Messages entrants + mises à jour de statut (Meta Cloud API). */
  @Post('meta')
  @HttpCode(HttpStatus.OK)
  receiveMeta(@Body() body: Record<string, unknown>) {
    void this.whatsapp.handleMetaWebhook(body ?? {}).catch((err: Error) => {
      this.logger.error(`Webhook Meta: ${err.message}`, err.stack);
    });
    return { ok: true };
  }
}
