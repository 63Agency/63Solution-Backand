import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import type { AppUser } from '../auth/types/app-user';
import { GenerateProposalPdfDto } from './dto/generate-proposal-pdf.dto';
import { StandaloneProposalPdfDto } from './dto/standalone-proposal-pdf.dto';
import { ProposalsService } from './proposals.service';

function proposalFilename(client: string): string {
  return `Proposition-${client.replace(/[^\w.-]+/g, '_')}.pdf`;
}

@Controller('leads')
@UseGuards(AuthGuard('jwt'))
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Post(':id/proposal/pdf')
  @HttpCode(HttpStatus.OK)
  async leadPdf(
    @Param('id') id: string,
    @Body() body: GenerateProposalPdfDto,
    @Req() req: { user: AppUser },
    @Res() res: Response,
  ) {
    const { buffer, client } = await this.proposals.buildPdf(
      id,
      req.user,
      body ?? {},
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${proposalFilename(client)}"`,
    );
    res.send(buffer);
  }
}

/** Generic branded proposal PDF — no lead required. */
@Controller('proposals')
@UseGuards(AuthGuard('jwt'))
export class ProposalsPdfController {
  constructor(private readonly proposals: ProposalsService) {}

  @Post('pdf')
  @HttpCode(HttpStatus.OK)
  async pdf(
    @Body() body: StandaloneProposalPdfDto,
    @Res() res: Response,
  ) {
    const { buffer, client } = await this.proposals.generate(body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${proposalFilename(client)}"`,
    );
    res.send(buffer);
  }
}
