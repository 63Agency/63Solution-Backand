import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { BroadcastWhatsappMessageDto } from './dto/broadcast-whatsapp-message.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(AuthGuard('jwt'))
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get('templates')
  listTemplates() {
    return this.whatsapp.listTemplates();
  }

  @Get('conversations')
  listConversations() {
    return this.whatsapp.listConversations();
  }

  @Get('conversations/:id')
  getConversation(@Param('id', ParseUUIDPipe) id: string) {
    return this.whatsapp.getConversation(id);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.whatsapp.listMessages(id, limit, cursor);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendWhatsappMessageDto,
    @Req() _req: { user: AppUser },
  ) {
    return this.whatsapp.sendMessage(id, dto);
  }

  @Post('broadcast')
  broadcast(@Body() dto: BroadcastWhatsappMessageDto) {
    return this.whatsapp.broadcastMessage(dto);
  }

  @Patch('conversations/:id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.whatsapp.markRead(id);
  }
}
