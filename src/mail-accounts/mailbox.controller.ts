import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import {
  ListMailboxMessagesQueryDto,
  MailboxAttachmentQueryDto,
  MailboxFolderQueryDto,
  MarkSeenDto,
  ReplyMailboxDto,
  SendMailboxDto,
} from './dto/mailbox.dto';
import { ImapMailboxService } from './imap-mailbox.service';

@Controller('me/mail')
@UseGuards(AuthGuard('jwt'))
export class MailboxController {
  constructor(private readonly mailbox: ImapMailboxService) {}

  @Get('folders')
  listFolders(@Req() req: { user: AppUser }) {
    return this.mailbox.listFolders(req.user.id);
  }

  @Get('messages')
  listMessages(
    @Req() req: { user: AppUser },
    @Query() query: ListMailboxMessagesQueryDto,
  ) {
    return this.mailbox.listMessages(
      req.user.id,
      query.folder,
      query.page,
      query.limit,
      query.search,
    );
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  send(@Req() req: { user: AppUser }, @Body() dto: SendMailboxDto) {
    return this.mailbox.send(req.user.id, dto);
  }

  @Get('messages/:uid/attachment')
  async downloadAttachment(
    @Req() req: { user: AppUser },
    @Param('uid', ParseIntPipe) uid: number,
    @Query() query: MailboxAttachmentQueryDto,
  ): Promise<StreamableFile> {
    const file = await this.mailbox.getAttachment(
      req.user.id,
      query.folder || 'INBOX',
      uid,
      query.index,
    );
    return new StreamableFile(file.content, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
      length: file.content.length,
    });
  }

  @Get('messages/:uid')
  getMessage(
    @Req() req: { user: AppUser },
    @Param('uid', ParseIntPipe) uid: number,
    @Query() query: MailboxFolderQueryDto,
  ) {
    return this.mailbox.getMessage(req.user.id, query.folder || 'INBOX', uid);
  }

  @Post('messages/:uid/seen')
  @HttpCode(HttpStatus.OK)
  markSeen(
    @Req() req: { user: AppUser },
    @Param('uid', ParseIntPipe) uid: number,
    @Body() dto: MarkSeenDto,
  ) {
    return this.mailbox.markSeen(req.user.id, dto.folder || 'INBOX', uid);
  }

  @Post('messages/:uid/reply')
  @HttpCode(HttpStatus.OK)
  reply(
    @Req() req: { user: AppUser },
    @Param('uid', ParseIntPipe) uid: number,
    @Body() dto: ReplyMailboxDto,
  ) {
    return this.mailbox.reply(req.user.id, dto.folder || 'INBOX', uid, dto);
  }
}
