import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientJwtGuard } from '../client-auth/client-jwt.guard';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { PortalTeamService } from './portal-team.service';

@Controller('client/team')
@UseGuards(ClientJwtGuard)
export class PortalTeamController {
  constructor(private readonly team: PortalTeamService) {}

  @Get()
  list(@Req() req: { user: PortalClientUser }) {
    return this.team.list(req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateTeamMemberDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.team.create(dto, req.user);
  }
}
