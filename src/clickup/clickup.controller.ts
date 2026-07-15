import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AppUser } from '../auth/types/app-user';
import { assertFullAdmin } from '../common/utils/access';
import { ClickupService } from './clickup.service';
import { verifyClickUpSignature } from './utils/clickup-signature';

type RawBodyRequest = Request & { rawBody?: Buffer };

@SkipThrottle()
@Controller('clickup')
export class ClickupController {
  private readonly logger = new Logger(ClickupController.name);

  constructor(
    private readonly clickup: ClickupService,
    private readonly config: ConfigService,
  ) {}

  /** Public CORS probe — no JWT. */
  @Get('test')
  @HttpCode(HttpStatus.OK)
  healthCheck() {
    return { ok: true, timestamp: new Date().toISOString() };
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Req() req: RawBodyRequest,
    @Body() body: Record<string, unknown>,
  ) {
    const payload = body ?? {};
    const rawBody =
      req.rawBody?.toString('utf8') ?? JSON.stringify(payload);
    const signature = req.headers['x-signature'];
    const secret =
      this.config.get<string>('CLICKUP_WEBHOOK_SECRET')?.trim() ?? '';

    if (secret) {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      const valid = verifyClickUpSignature(
        typeof sig === 'string' ? sig : undefined,
        rawBody,
        secret,
      );
      if (!valid) {
        this.logger.warn('[ClickUp webhook] invalid X-Signature');
        throw new ForbiddenException({ message: 'Signature webhook invalide' });
      }
    }

    const event = String(payload.event ?? '');
    this.logger.log(`[ClickUp webhook] event=${event} task_id=${String(payload.task_id ?? '')}`);

    const lead = await this.clickup.handleWebhookEvent(payload);
    return { ok: true, event, leadId: lead?.id ?? null };
  }

  @Post('sync')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async syncAllLeads(@Req() req: { user: AppUser }) {
    assertFullAdmin(req.user);
    const synced = await this.clickup.syncAllLeads();
    return { ok: true, synced };
  }
}
