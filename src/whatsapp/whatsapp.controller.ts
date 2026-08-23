import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import type { AppUser } from '../auth/types/app-user';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { BroadcastWhatsappMessageDto } from './dto/broadcast-whatsapp-message.dto';
import { SendWhatsappTemplateDto } from './dto/send-whatsapp-template.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(AuthGuard('jwt'))
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get('templates')
  listTemplates() {
    return this.whatsapp.listTemplates();
  }

  /**
   * Resolve Meta media id → temporary download URL for the frontend.
   * GET Graph /v18.0/:mediaId → { url, mimeType, mediaId }
   */
  @Get('media/:mediaId')
  getMedia(@Param('mediaId') mediaId: string) {
    return this.whatsapp.getMediaUrl(mediaId);
  }

  /**
   * Proxy-download media bytes (browser <audio> cannot send Meta Bearer token).
   * Frontend: fetch with JWT → blob → URL.createObjectURL → <audio src>.
   */
  @Get('media/:mediaId/content')
  @Header('Cache-Control', 'private, max-age=300')
  async getMediaContent(
    @Param('mediaId') mediaId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.whatsapp.getMediaContent(mediaId);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.buffer.length),
    });
    return new StreamableFile(file.buffer);
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

  /**
   * Template Meta (ex. « Envoyer Bonjour ») lié à la conversation ouverte.
   * Body : { templateName, templateLanguage?, variable1? }
   */
  @Post('conversations/:id/messages/template')
  sendTemplateMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendWhatsappTemplateDto,
  ) {
    return this.whatsapp.sendTemplateToConversation(id, dto);
  }

  @Post('broadcast')
  broadcast(@Body() dto: BroadcastWhatsappMessageDto) {
    return this.whatsapp.broadcastMessage(dto);
  }

  /** Alias front (fallback si /broadcast 404). Même body / réponse que broadcast. */
  @Post('messages/bulk')
  broadcastBulk(@Body() dto: BroadcastWhatsappMessageDto) {
    return this.whatsapp.broadcastMessage(dto);
  }

  @Patch('conversations/:id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.whatsapp.markRead(id);
  }
}
