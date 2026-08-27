import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import { BroadcastEmailDto } from './dto/broadcast-email.dto';
import { EmailService } from './email.service';

@Controller('email')
@UseGuards(AuthGuard('jwt'))
export class EmailController {
  constructor(private readonly email: EmailService) {}

  /** Destinataires leads (email non vide). Auth = WhatsApp broadcast. */
  @Get('recipients')
  listRecipients(
    @Req() req: { user: AppUser },
    @Query('listId') listId?: string,
    @Query('status') status?: string,
  ) {
    return this.email.listRecipients(req.user, { listId, status });
  }

  /**
   * Envoi bulk HTML ({{name}}). Un email par destinataire.
   * Auth = admin + admin_whatsapp (comme POST /whatsapp/broadcast).
   */
  @Post('broadcast')
  broadcast(
    @Req() req: { user: AppUser },
    @Body() dto: BroadcastEmailDto,
  ) {
    return this.email.broadcast(req.user, dto);
  }
}
