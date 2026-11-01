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
import { ProposalsService } from './proposals.service';

@Controller('leads')
@UseGuards(AuthGuard('jwt'))
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Post(':id/proposal/pdf')
  @HttpCode(HttpStatus.OK)
  async pdf(
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
    const filename = `Proposition-${client.replace(/[^\w.-]+/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }
}
