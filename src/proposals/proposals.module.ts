import { Module } from '@nestjs/common';
import { ClickupModule } from '../clickup/clickup.module';
import {
  ProposalsController,
  ProposalsPdfController,
} from './proposals.controller';
import { ProposalsService } from './proposals.service';

@Module({
  imports: [ClickupModule],
  controllers: [ProposalsController, ProposalsPdfController],
  providers: [ProposalsService],
})
export class ProposalsModule {}
