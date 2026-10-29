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
import type { AppUser } from '../auth/types/app-user';
import { CreatePortalClientDto } from './dto/create-portal-client.dto';
import { PortalClientsService } from './portal-clients.service';

/**
 * Admin CRM only — gestion des comptes portail.
 * Protégé par AuthGuard('jwt') + assertFullAdmin (token client refusé).
 */
@Controller('portal/clients')
@UseGuards(AuthGuard('jwt'))
export class PortalClientsController {
  constructor(private readonly portalClients: PortalClientsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePortalClientDto, @Req() req: { user: AppUser }) {
    return this.portalClients.create(dto, req.user);
  }

  @Get()
  list(@Req() req: { user: AppUser }) {
    return this.portalClients.list(req.user);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @Req() req: { user: AppUser }) {
    return this.portalClients.setActive(id, true, req.user);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @Req() req: { user: AppUser }) {
    return this.portalClients.setActive(id, false, req.user);
  }
}
