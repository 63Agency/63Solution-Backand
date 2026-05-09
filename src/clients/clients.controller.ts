import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientsService } from './clients.service';

@Controller('clients')
@UseGuards(AuthGuard('jwt'))
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Req() req: { user: AppUser }) {
    return this.clients.list(req.user);
  }

  @Get('list')
  listAlias(@Req() req: { user: AppUser }) {
    return this.clients.list(req.user);
  }

  @Get('mine')
  mine(@Req() req: { user: AppUser }) {
    return this.clients.list(req.user);
  }

  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @Req() req: { user: AppUser },
  ) {
    return this.clients.update(id, dto, req.user);
  }

  @Put(':id')
  put(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @Req() req: { user: AppUser },
  ) {
    return this.clients.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: { user: AppUser }) {
    return this.clients.remove(id, req.user);
  }
}
