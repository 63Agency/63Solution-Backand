import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import { DashboardKpisService } from './dashboard-kpis.service';
import { DashboardKpisQueryDto } from './dto/dashboard-kpis-query.dto';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly kpis: DashboardKpisService) {}

  /**
   * KPIs Dashboard Data (counts).
   * Accès : admin + admin_whatsapp. Période Casa optionnelle (max 366 j).
   */
  @Get('kpis')
  getKpis(
    @Req() req: { user: AppUser },
    @Query() query: DashboardKpisQueryDto,
  ) {
    return this.kpis.getKpis(req.user, query.from, query.to);
  }
}
