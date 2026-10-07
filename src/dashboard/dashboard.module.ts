import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardKpisService } from './dashboard-kpis.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardKpisService],
})
export class DashboardModule {}
