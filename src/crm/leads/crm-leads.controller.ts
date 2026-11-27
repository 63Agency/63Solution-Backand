import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../../auth/types/app-user';
import { CrmLeadsService } from './crm-leads.service';
import { CreateCrmLeadDto } from './dto/create-crm-lead.dto';
import { PatchCrmLeadDto } from './dto/patch-crm-lead.dto';

@Controller('crm/leads')
@UseGuards(AuthGuard('jwt'))
export class CrmLeadsController {
  constructor(private readonly leads: CrmLeadsService) {}

  /** Liste agrégée LeadRow[] (limite interne 2000). */
  @Get()
  list(@Req() req: { user: AppUser }) {
    return this.leads.list(req.user);
  }

  @Get(':id')
  getOne(@Req() req: { user: AppUser }, @Param('id') id: string) {
    return this.leads.getOne(req.user, id);
  }

  @Patch(':id')
  patch(
    @Req() req: { user: AppUser },
    @Param('id') id: string,
    @Body() dto: PatchCrmLeadDto,
  ) {
    return this.leads.patch(req.user, id, dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: { user: AppUser }, @Body() dto: CreateCrmLeadDto) {
    return this.leads.create(req.user, dto);
  }
}
