import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  HttpCode,
  HttpStatus,
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
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { SendWhatsappTemplateDto } from './dto/send-whatsapp-template.dto';
import { WhatsappBroadcastJobsService } from './whatsapp-broadcast-jobs.service';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(AuthGuard('jwt'))
export class WhatsappController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly broadcastJobs: WhatsappBroadcastJobsService,
  ) {}

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

  // ─── Broadcast async (template only) ───────────────────

  /** Liste des jobs récents (tous les admin / admin_whatsapp). */
  @Get('broadcast')
  listBroadcastJobs(@Req() req: { user: AppUser }) {
    return this.broadcastJobs.listJobs(req.user);
  }

  /**
   * Lance un job broadcast async (template Meta).
   * Réponse 202 : { jobId, total, status: "pending" }.
   */
  @Post('broadcast')
  @HttpCode(HttpStatus.ACCEPTED)
  createBroadcast(
    @Body() dto: CreateBroadcastDto,
    @Req() req: { user: AppUser },
  ) {
    return this.broadcastJobs.createJob(dto, req.user);
  }

  /** Alias front (fallback). Même body / 202 que POST /broadcast. */
  @Post('messages/bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  createBroadcastBulk(
    @Body() dto: CreateBroadcastDto,
    @Req() req: { user: AppUser },
  ) {
    return this.broadcastJobs.createJob(dto, req.user);
  }

  @Get('broadcast/:jobId')
  getBroadcastJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: { user: AppUser },
  ) {
    return this.broadcastJobs.getJob(jobId, req.user);
  }

  @Get('broadcast/:jobId/results')
  listBroadcastResults(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: { user: AppUser },
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.broadcastJobs.listResults(jobId, req.user, { limit, offset });
  }

  @Post('broadcast/:jobId/cancel')
  cancelBroadcast(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: { user: AppUser },
  ) {
    return this.broadcastJobs.cancelJob(jobId, req.user);
  }

  // ─── Conversations ─────────────────────────────────────

  @Get('conversations')
  listConversations() {
    return this.whatsapp.listConversations();
  }

  @Get('conversations/:id')
  getConversation(@Param('id', ParseUUIDPipe) id: string) {
    return this.whatsapp.getConversation(id);
  }

  /**
   * Messages d'une conversation.
   * - défaut : oldest-first + nextCursor (comportement historique)
   * - direction=latest : N derniers (items ASC) + olderCursor pour scroll-up
   * - before / olderCursor : page plus ancienne (scroll-up)
   */
  @Get('conversations/:id/messages')
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
    @Query('direction') direction?: string,
    @Query('before') before?: string,
    @Query('olderCursor') olderCursor?: string,
  ) {
    return this.whatsapp.listMessages(id, limit, cursor, {
      direction,
      before: before ?? olderCursor,
    });
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

  @Patch('conversations/:id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.whatsapp.markRead(id);
  }
}
