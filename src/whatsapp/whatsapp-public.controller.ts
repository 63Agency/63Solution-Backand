import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/** Routes WhatsApp publiques (sans JWT). */
@SkipThrottle()
@Controller('whatsapp')
export class WhatsappPublicController {
  @Get('test')
  @HttpCode(HttpStatus.OK)
  healthCheck() {
    return { ok: true, timestamp: new Date().toISOString() };
  }
}
