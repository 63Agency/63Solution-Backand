import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ContactFormDto } from './dto/contact-form.dto';
import { ContactService } from './contact.service';
import { flattenValidationErrors } from '../common/utils/validation-errors';

@Controller('public')
export class PublicController {
  constructor(private readonly contact: ContactService) {}

  /**
   * Formulaire contact site vitrine (63agency.com) — sans JWT.
   * Rate-limit : 5 req / 60s / IP.
   * Honeypot vérifié avant la validation (bot → 200 silencieux).
   */
  @Post('contact')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async submitContact(@Body() body: Record<string, unknown>) {
    const website =
      typeof body?.website === 'string' ? body.website.trim() : '';
    if (website) {
      return { success: true };
    }

    const dto = plainToInstance(ContactFormDto, body, {
      enableImplicitConversion: true,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const lines = flattenValidationErrors(errors);
      throw new BadRequestException({
        message: lines[0] ?? 'Corps de requête invalide',
      });
    }

    return this.contact.submit(dto);
  }
}
