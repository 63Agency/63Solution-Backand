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
import { FromDevisTransferDto } from '../factures/dto/from-devis-transfer.dto';
import { FacturesService } from '../factures/factures.service';
import { DevisService } from './devis.service';
import { UpsertDevisDto } from './dto/upsert-devis.dto';

@Controller('devis')
@UseGuards(AuthGuard('jwt'))
export class DevisController {
  constructor(
    private readonly devisService: DevisService,
    private readonly facturesService: FacturesService,
  ) {}

  @Get()
  list(@Req() req: { user: AppUser }) {
    return this.devisService.list(req.user);
  }

  @Post()
  create(@Body() dto: UpsertDevisDto, @Req() req: { user: AppUser }) {
    return this.devisService.create(dto, req.user);
  }

  @Get(':id')
  getById(@Param('id') id: string, @Req() req: { user: AppUser }) {
    return this.devisService.getById(id, req.user);
  }

  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Body() dto: UpsertDevisDto,
    @Req() req: { user: AppUser },
  ) {
    return this.devisService.patch(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: { user: AppUser }) {
    return this.devisService.remove(id, req.user);
  }

  @Post(':id/transfer-to-facture')
  transferToFacture(
    @Param('id') id: string,
    @Body(new DefaultValuePipe({})) body: FromDevisTransferDto,
    @Req() req: { user: AppUser },
  ) {
    return this.facturesService.fromDevis(id, req.user, body);
  }

  @Post(':id/convert')
  convertToFacture(
    @Param('id') id: string,
    @Body(new DefaultValuePipe({})) body: FromDevisTransferDto,
    @Req() req: { user: AppUser },
  ) {
    return this.facturesService.fromDevis(id, req.user, body);
  }

  @Post(':id/send-email')
  sendEmail(
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
    @Req() req: { user: AppUser },
  ) {
    return this.devisService.sendEmail(id, dto, req.user);
  }

  @Post(':id/email')
  sendEmailAlias(
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
    @Req() req: { user: AppUser },
  ) {
    return this.devisService.sendEmail(id, dto, req.user);
  }

  @Post(':id/send')
  sendEmailAlias2(
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
    @Req() req: { user: AppUser },
  ) {
    return this.devisService.sendEmail(id, dto, req.user);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id') id: string,
    @Req() req: { user: AppUser },
    @Res() res: Response,
  ) {
    const entity = await this.devisService.getById(id, req.user);
    const pdf = await this.devisService.buildPdf(id, req.user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="devis-${entity.numero}.pdf"`,
    );
    res.send(pdf);
  }
}
