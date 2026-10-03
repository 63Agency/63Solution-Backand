import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import { AdminActivityService } from './admin-activity.service';
import { ActivityQueryDto } from './dto/activity-query.dto';

@Controller('admin')
@UseGuards(AuthGuard('jwt'))
export class AdminController {
  constructor(private readonly activity: AdminActivityService) {}

  /**
   * Feed activité récente (meetings / leads / broadcasts).
   * Accès : full admin only.
   */
  @Get('activity')
  listActivity(
    @Req() req: { user: AppUser },
    @Query() query: ActivityQueryDto,
  ) {
    return this.activity.listActivity(req.user, query.limit);
  }
}
