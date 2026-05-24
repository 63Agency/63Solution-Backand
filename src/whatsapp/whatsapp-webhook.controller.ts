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
import { stringifyForLog } from './utils/whatsapp-debug-log';
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
    this.logger.log(
      `[Webhook Meta GET] mode=${mode ?? ''} verify_token=${verifyToken ? '[set]' : '[empty]'} challenge=${challenge ? '[set]' : '[empty]'}`,
    );
    const ok = this.whatsapp.verifyMetaWebhook(mode, verifyToken, challenge);
    if (!ok) {
      this.logger.warn('[Webhook Meta GET] verify token mismatch — 403');
      throw new ForbiddenException({ message: 'Verify token invalide' });
    }
    this.logger.log('[Webhook Meta GET] verification OK — returning challenge');
    return ok;
  }

  /** Messages entrants + mises à jour de statut (Meta Cloud API). */
  @Post('meta')
  @HttpCode(HttpStatus.OK)
  receiveMeta(@Body() body: Record<string, unknown>) {
    const payload = body ?? {};
    this.logger.log(
      `[Webhook Meta POST] incoming request body:\n${stringifyForLog(payload)}`,
    );

    void this.whatsapp.handleMetaWebhook(payload).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `[Webhook Meta POST] handler failed: ${message}`,
        stack,
      );
      if (err && typeof err === 'object' && !(err instanceof Error)) {
        this.logger.error(
          `[Webhook Meta POST] error detail:\n${stringifyForLog(err)}`,
        );
      }
    });

    return { ok: true };
  }
}
