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
  UseGuards,
} from '@nestjs/common';
import { ClientJwtGuard } from '../client-auth/client-jwt.guard';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { MetaCallbackDto } from './dto/meta-callback.dto';
import { UpdateMetaFormDto } from './dto/update-meta-form.dto';
import { PortalMetaService } from './portal-meta.service';

@Controller('client/meta')
@UseGuards(ClientJwtGuard)
export class PortalMetaController {
  constructor(private readonly meta: PortalMetaService) {}

  @Get('connect-url')
  connectUrl(@Req() req: { user: PortalClientUser }) {
    return this.meta.getConnectUrl(req.user);
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  callback(
    @Body() dto: MetaCallbackDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.meta.handleCallback(dto, req.user);
  }

  @Get('status')
  status(@Req() req: { user: PortalClientUser }) {
    return this.meta.status(req.user);
  }

  @Patch('forms/:formId')
  updateForm(
    @Param('formId') formId: string,
    @Body() dto: UpdateMetaFormDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.meta.setFormLinked(formId, dto, req.user);
  }

  @Delete('connection')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@Req() req: { user: PortalClientUser }) {
    await this.meta.disconnect(req.user);
  }
}
