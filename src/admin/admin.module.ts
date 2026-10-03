import { Module } from '@nestjs/common';
import { AdminActivityService } from './admin-activity.service';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
  providers: [AdminActivityService],
})
export class AdminModule {}
