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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientJwtGuard } from '../client-auth/client-jwt.guard';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadOwnerDto } from './dto/update-lead-owner.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { PortalLeadsService } from './portal-leads.service';

@Controller('client/leads')
@UseGuards(ClientJwtGuard)
export class PortalLeadsController {
  constructor(private readonly leads: PortalLeadsService) {}

  @Get()
  list(
    @Query() query: ListLeadsQueryDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.leads.list(req.user, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLeadDto, @Req() req: { user: PortalClientUser }) {
    return this.leads.create(dto, req.user);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStageDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.leads.updateStage(id, dto, req.user);
  }

  @Patch(':id/owner')
  updateOwner(
    @Param('id') id: string,
    @Body() dto: UpdateLeadOwnerDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.leads.updateOwner(id, dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.leads.update(id, dto, req.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Req() req: { user: PortalClientUser },
  ) {
    await this.leads.remove(id, req.user);
  }
}
