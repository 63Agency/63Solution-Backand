import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import { BroadcastEmailDto } from './dto/broadcast-email.dto';
import { UpsertEmailTemplateDto } from './dto/upsert-email-template.dto';
import { EmailService } from './email.service';

@Controller('email')
@UseGuards(AuthGuard('jwt'))
export class EmailController {
  constructor(private readonly email: EmailService) {}

  /** Tous les mappings WA → email (pré-remplissage composer). */
  @Get('templates')
  listTemplates(@Req() req: { user: AppUser }) {
    return this.email.listTemplates(req.user);
  }

  /** Un mapping par nom de template Meta (auto-fill). */
  @Get('templates/:waTemplateName')
  getTemplate(
    @Req() req: { user: AppUser },
    @Param('waTemplateName') waTemplateName: string,
  ) {
    return this.email.getTemplateByWaName(req.user, waTemplateName);
  }

  /** Upsert mapping (admin only). */
  @Put('templates/:waTemplateName')
  upsertTemplate(
    @Req() req: { user: AppUser },
    @Param('waTemplateName') waTemplateName: string,
    @Body() dto: UpsertEmailTemplateDto,
  ) {
    return this.email.upsertTemplate(req.user, waTemplateName, dto);
  }

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
   * Ne lit PAS email_templates — subject/html fournis par le front.
   */
  @Post('broadcast')
  broadcast(
    @Req() req: { user: AppUser },
    @Body() dto: BroadcastEmailDto,
  ) {
    return this.email.broadcast(req.user, dto);
  }
}
