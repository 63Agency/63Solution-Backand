import { Module } from '@nestjs/common';
import { ClickupModule } from '../clickup/clickup.module';
import { LeadsController } from './leads.controller';

@Module({
  imports: [ClickupModule],
  controllers: [LeadsController],
})
export class LeadsModule {}
