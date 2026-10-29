import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientAuthService } from './client-auth.service';
import { ClientJwtGuard } from './client-jwt.guard';
import { ClientLoginDto } from './dto/client-login.dto';
import type { PortalClientUser } from './types/portal-client-user';

@Controller('client-auth')
export class ClientAuthController {
  constructor(private readonly clientAuth: ClientAuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  login(@Body() dto: ClientLoginDto) {
    return this.clientAuth.login(dto);
  }

  @Get('me')
  @UseGuards(ClientJwtGuard)
  me(@Req() req: { user: PortalClientUser }) {
    return this.clientAuth.me(req.user);
  }
}
