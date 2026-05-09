import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
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
import { FromDevisTransferDto } from './dto/from-devis-transfer.dto';
import { UpsertFactureDto } from './dto/upsert-facture.dto';
import { FacturesService } from './factures.service';

@Controller('factures')
@UseGuards(AuthGuard('jwt'))
export class FacturesController {
  constructor(private readonly factures: FacturesService) {}

  @Get()
  list(@Req() req: { user: AppUser }) {
    return this.factures.list(req.user);
  }

  @Post()
  create(@Body() dto: UpsertFactureDto, @Req() req: { user: AppUser }) {
    return this.factures.create(dto, req.user);
  }

  @Post('from-devis/:devisId')
  fromDevis(
    @Param('devisId') devisId: string,
    @Body(new DefaultValuePipe({})) body: FromDevisTransferDto,
    @Req() req: { user: AppUser },
  ) {
    return this.factures.fromDevis(devisId, req.user, body);
  }

  @Get(':id')
  getById(@Param('id') id: string, @Req() req: { user: AppUser }) {
    return this.factures.getById(id, req.user);
  }

  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Body() dto: UpsertFactureDto,
    @Req() req: { user: AppUser },
  ) {
    return this.factures.patch(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: { user: AppUser }) {
    return this.factures.remove(id, req.user);
  }

  @Post(':id/send-email')
  sendEmail(
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
    @Req() req: { user: AppUser },
  ) {
    return this.factures.sendEmail(id, dto, req.user);
  }

  @Post(':id/email')
  sendEmailAlias(
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
    @Req() req: { user: AppUser },
  ) {
    return this.factures.sendEmail(id, dto, req.user);
  }

  @Post(':id/send')
  sendEmailAlias2(
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
    @Req() req: { user: AppUser },
  ) {
    return this.factures.sendEmail(id, dto, req.user);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id') id: string,
    @Req() req: { user: AppUser },
    @Res() res: Response,
  ) {
    const entity = await this.factures.getById(id, req.user);
    const pdf = await this.factures.buildPdf(id, req.user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="facture-${entity.numero}.pdf"`,
    );
    res.send(pdf);
  }
}
