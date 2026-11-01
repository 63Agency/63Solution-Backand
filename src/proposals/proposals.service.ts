import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { AppUser } from '../auth/types/app-user';
import { ClickupService } from '../clickup/clickup.service';
import type { GenerateProposalPdfDto } from './dto/generate-proposal-pdf.dto';
import { renderProposalPdf } from './proposal.pdf';

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(private readonly clickup: ClickupService) {}

  async buildPdf(
    leadId: string,
    user: AppUser,
    body: GenerateProposalPdfDto,
  ): Promise<{ buffer: Buffer; client: string }> {
    try {
      const { item: lead } = await this.clickup.getLeadById(user, leadId);
      const client =
        body.client?.trim() || lead.name?.trim() || 'Client';

      const buffer = await renderProposalPdf({
        client,
        date: body.date,
        offerName: body.offerName,
        price: body.price,
        currency: body.currency,
        period: body.period,
        adBudget: body.adBudget,
      });

      return { buffer, client };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error(
        `Proposal PDF failed for lead ${leadId}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
      );
      throw new InternalServerErrorException({
        message: 'Impossible de générer le PDF de proposition.',
      });
    }
  }
}
