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
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { MetaLeadgenWebhookBody } from './meta-webhook.service';
import { MetaWebhookService } from './meta-webhook.service';
import { verifyMetaWebhookSignature } from './utils/meta-webhook-signature';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Public Meta Lead Ads webhook (no ClientJwtGuard).
 * Configured in Facebook App dashboard → Webhooks → Page → leadgen.
 */
@SkipThrottle()
@Controller('portal/meta')
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly webhook: MetaWebhookService,
  ) {}

  /** Standard Meta hub challenge handshake. */
  @Get('webhook')
  @HttpCode(HttpStatus.OK)
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const expected =
      this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN')?.trim() ?? '';

    if (
      mode === 'subscribe' &&
      expected &&
      verifyToken?.trim() === expected
    ) {
      this.logger.log('[Meta Leadgen GET] verification OK');
      return challenge ?? '';
    }

    this.logger.warn('[Meta Leadgen GET] verify token mismatch — 403');
    throw new ForbiddenException({ message: 'Verify token invalide' });
  }

  /**
   * Leadgen events. Signature required (X-Hub-Signature-256 + META_APP_SECRET).
   * Ack 200 immediately, then process asynchronously.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  receive(
    @Req() req: RawBodyRequest,
    @Body() body: MetaLeadgenWebhookBody,
  ) {
    const appSecret =
      this.config.get<string>('META_APP_SECRET')?.trim() ?? '';
    const header = req.headers['x-hub-signature-256'];
    const signature = Array.isArray(header) ? header[0] : header;
    const rawBody = req.rawBody;

    if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      this.logger.warn(
        '[Meta Leadgen POST] rawBody manquant — impossible de vérifier X-Hub-Signature-256',
      );
      throw new ForbiddenException({
        message: 'Signature webhook invalide (raw body manquant)',
      });
    }

    const valid = verifyMetaWebhookSignature(
      typeof signature === 'string' ? signature : undefined,
      rawBody,
      appSecret,
    );
    if (!valid) {
      this.logger.warn(
        `[Meta Leadgen POST] invalid X-Hub-Signature-256 rawBodyLength=${rawBody.length} headerPresent=${Boolean(signature)}`,
      );
      throw new ForbiddenException({ message: 'Signature webhook invalide' });
    }

    const payload = body ?? {};
    void this.webhook.processWebhook(payload).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `[Meta Leadgen POST] processing failed: ${message}`,
        stack,
      );
    });

    return { ok: true };
  }
}
