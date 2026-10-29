import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ClientJwtGuard } from '../client-auth/client-jwt.guard';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import {
  ActivityFeedQueryDto,
  StatsScopeQueryDto,
  SuiviStatsQueryDto,
} from './dto/stats-query.dto';
import { PortalStatsService } from './portal-stats.service';

@Controller('client/stats')
@UseGuards(ClientJwtGuard)
export class PortalStatsController {
  constructor(private readonly stats: PortalStatsService) {}

  @Get('overview')
  overview(
    @Query() query: StatsScopeQueryDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.stats.overview(req.user, query);
  }

  @Get('suivi')
  suivi(
    @Query() query: SuiviStatsQueryDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.stats.suivi(req.user, query);
  }

  @Get('performance')
  performance(
    @Query() query: StatsScopeQueryDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.stats.performance(req.user, query);
  }
}

@Controller('client/activity')
@UseGuards(ClientJwtGuard)
export class PortalActivityController {
  constructor(private readonly stats: PortalStatsService) {}

  @Get()
  list(
    @Query() query: ActivityFeedQueryDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.stats.listAllActivity(req.user, query);
  }
}
