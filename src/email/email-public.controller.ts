import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { BrevoWebhookService } from './brevo-webhook.service';
import { EmailTrackingService } from './email-tracking.service';
import { UnsubscribeService } from './unsubscribe.service';

function unsubscribeHtmlPage(ok: boolean, detail?: string): string {
  if (ok) {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Désabonnement — 63 Agency</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#222;">
  <h1 style="font-size:1.35rem;">Vous êtes désabonné(e)</h1>
  <p>Vous ne recevrez plus nos emails groupés. Si c’était une erreur, contactez-nous à
    <a href="mailto:contact@63agency.ma">contact@63agency.ma</a>.</p>
</body>
</html>`;
  }
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lien invalide — 63 Agency</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#222;">
  <h1 style="font-size:1.35rem;">Lien de désabonnement invalide</h1>
  <p>${detail ?? 'Ce lien est invalide ou a expiré.'}</p>
  <p>Contact : <a href="mailto:contact@63agency.ma">contact@63agency.ma</a></p>
</body>
</html>`;
}

/** Routes email publiques (sans JWT) — désabonnement + webhook Brevo + pixel. */
@Controller('email')
export class EmailPublicController {
  constructor(
    private readonly unsubscribe: UnsubscribeService,
    private readonly brevo: BrevoWebhookService,
    private readonly tracking: EmailTrackingService,
  ) {}

  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unsubscribeGet(@Query('token') token?: string): Promise<string> {
    const email = this.unsubscribe.verifyToken(token ?? '');
    if (!email) {
      return unsubscribeHtmlPage(false);
    }
    try {
      await this.unsubscribe.addUnsubscribe(email, 'link');
      return unsubscribeHtmlPage(true);
    } catch {
      return unsubscribeHtmlPage(
        false,
        'Impossible d’enregistrer le désabonnement. Réessayez plus tard.',
      );
    }
  }

  /**
   * List-Unsubscribe One-Click (RFC 8058).
   * POST sur la même URL que List-Unsubscribe (token en query).
   */
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unsubscribePost(@Query('token') token?: string) {
    const email = this.unsubscribe.verifyToken(token ?? '');
    if (!email) {
      throw new BadRequestException({
        message: 'token de désabonnement invalide',
      });
    }
    await this.unsubscribe.addUnsubscribe(email, 'one-click');
    return { ok: true };
  }

  /**
   * Webhook Brevo transactional (delivered / opened / bounce / …).
   * Auth : ?token=BREVO_WEBHOOK_SECRET
   */
  @Post('brevo-webhook')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async brevoWebhook(
    @Query('token') token: string | undefined,
    @Body() body: unknown,
  ) {
    this.brevo.assertWebhookToken(token);
    return this.brevo.handleWebhook(body);
  }

  /**
   * Pixel open-tracking 1×1 PNG (sans JWT).
   * registerOpen best-effort — toujours renvoyer le PNG.
   */
  @Get('pixel/:trackingId.png')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async openPixel(
    @Param('trackingId') trackingIdParam: string,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const trackingId = String(trackingIdParam ?? '')
      .replace(/\.png$/i, '')
      .trim();
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : null) ||
      req.ip ||
      null;
    const ua =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    await this.tracking.registerOpen(trackingId, ip, ua);
    return new StreamableFile(this.tracking.transparentPng());
  }
}
