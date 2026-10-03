import {
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

@Controller('leads')
@UseGuards(AuthGuard('jwt'))
export class LeadsController {
  constructor(private readonly clickup: ClickupService) {}

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

  @Get(':id')
  getOne(@Req() req: { user: AppUser }, @Param('id') id: string) {
    return this.clickup.getLeadById(req.user, id);
  }
}