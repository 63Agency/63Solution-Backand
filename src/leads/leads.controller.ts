import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import { ClickupService } from '../clickup/clickup.service';
import { LeadsStatsOverviewQueryDto } from './dto/leads-stats-overview-query.dto';
import { SendLeadEmailDto } from './dto/send-lead-email.dto';
import { SendLeadWhatsappTemplateDto } from './dto/send-lead-whatsapp-template.dto';
import { LeadsService } from './leads.service';

@Controller('leads')
@UseGuards(AuthGuard('jwt'))
export class LeadsController {
  constructor(
    private readonly clickup: ClickupService,
    private readonly leads: LeadsService,
  ) {}

  @Get()
  list(
    @Req() req: { user: AppUser },
    @Query('status') status?: string,
    @Query('listId') listId?: string,
    @Query('search') search?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.clickup.listLeads(req.user, {
      status,
      listId,
      search,
      limit,
      offset,
    });
  }

  @Get('meta')
  meta(@Req() req: { user: AppUser }) {
    return this.clickup.getLeadsMeta(req.user);
  }

  /**
   * Agrégats SQL dashboard (par statut / liste / jour Casa).
   * Accès : admin + admin_whatsapp. Période optionnelle.
   */
  @Get('stats/overview')
  statsOverview(
    @Req() req: { user: AppUser },
    @Query() query: LeadsStatsOverviewQueryDto,
  ) {
    return this.clickup.getLeadsStatsOverview(req.user, query.from, query.to);
  }

  /** Rétro-compat : { total, byStatus: Record }. Délègue au SQL overview. */
  @Get('stats')
  stats(@Req() req: { user: AppUser }) {
    return this.clickup.getLeadsStats(req.user);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(@Req() req: { user: AppUser }) {
    return this.clickup.syncLeadsForUser(req.user);
  }

  /** Thread WhatsApp du lead (match phone ↔ conversation). */
  @Get(':id/whatsapp-thread')
  getWhatsappThread(@Req() req: { user: AppUser }, @Param('id') id: string) {
    return this.leads.getWhatsappThread(req.user, id);
  }

  /** Fil email du lead (boîte perso + futurs inbound). */
  @Get(':id/emails')
  listEmails(@Req() req: { user: AppUser }, @Param('id') id: string) {
    return this.leads.listEmails(req.user, id);
  }

  /** Envoi depuis la boîte SMTP de l’utilisateur connecté. */
  @Post(':id/email')
  @HttpCode(HttpStatus.OK)
  sendEmail(
    @Req() req: { user: AppUser },
    @Param('id') id: string,
    @Body() dto: SendLeadEmailDto,
  ) {
    return this.leads.sendEmail(req.user, id, dto);
  }

  /** Envoi template Meta au lead — persisté dans whatsapp_messages. */
  @Post(':id/whatsapp/template')
  @HttpCode(HttpStatus.OK)
  sendWhatsappTemplate(
    @Req() req: { user: AppUser },
    @Param('id') id: string,
    @Body() dto: SendLeadWhatsappTemplateDto,
  ) {
    return this.leads.sendWhatsappTemplate(req.user, id, dto);
  }

  @Get(':id')
  getOne(@Req() req: { user: AppUser }, @Param('id') id: string) {
    return this.clickup.getLeadById(req.user, id);
  }
}
