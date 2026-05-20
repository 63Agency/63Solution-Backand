import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import type { AppUser } from '../auth/types/app-user';
import { SendDocumentEmailDto } from '../common/dto/send-document-email.dto';
import { UpsertPropositionDto } from './dto/upsert-proposition.dto';
import { PropositionsService } from './propositions.service';

@Controller('propositions')
@UseGuards(AuthGuard('jwt'))
export class PropositionsController {
  constructor(private readonly propositions: PropositionsService) {}

  @Get()
  list(@Req() req: { user: AppUser }) {
    return this.propositions.list(req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: UpsertPropositionDto, @Req() req: { user: AppUser }) {
    return this.propositions.create(dto, req.user);
  }

  @Post(':id/send-email')
  sendEmail(
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
    @Req() req: { user: AppUser },
  ) {
    return this.propositions.sendEmail(id, dto, req.user);
  }

  @Post(':id/email')
  sendEmailAlias(
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
    @Req() req: { user: AppUser },
  ) {
    return this.propositions.sendEmail(id, dto, req.user);
  }

  @Post(':id/send')
  sendEmailAlias2(
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
    @Req() req: { user: AppUser },
  ) {
    return this.propositions.sendEmail(id, dto, req.user);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id') id: string,
    @Req() req: { user: AppUser },
    @Res() res: Response,
  ) {
    const entity = await this.propositions.getById(id, req.user);
    const pdf = await this.propositions.buildPdf(id, req.user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="proposition-${entity.numero}.pdf"`,
    );
    res.send(pdf);
  }

  @Get(':id')
  getById(@Param('id') id: string, @Req() req: { user: AppUser }) {
    return this.propositions.getById(id, req.user);
  }

  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Body() dto: UpsertPropositionDto,
    @Req() req: { user: AppUser },
  ) {
    return this.propositions.patch(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: { user: AppUser }) {
    return this.propositions.remove(id, req.user);
  }
}
