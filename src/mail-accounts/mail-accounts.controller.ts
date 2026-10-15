import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import { TestMailAccountDto } from './dto/test-mail-account.dto';
import { UpsertMailAccountDto } from './dto/upsert-mail-account.dto';
import { MailAccountsService } from './mail-accounts.service';

@Controller('me/mail-account')
@UseGuards(AuthGuard('jwt'))
export class MailAccountsController {
  constructor(private readonly mailAccounts: MailAccountsService) {}

  /** Compte mail du user JWT — sans mot de passe. */
  @Get()
  getMine(@Req() req: { user: AppUser }) {
    return this.mailAccounts.getMine(req.user);
  }

  /** Upsert SMTP/IMAP (password chiffré AES-256-GCM). */
  @Put()
  upsertMine(
    @Req() req: { user: AppUser },
    @Body() dto: UpsertMailAccountDto,
  ) {
    return this.mailAccounts.upsertMine(req.user, dto);
  }

  /** Test SMTP verify + IMAP login. Ne renvoie jamais le password. */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  testMine(
    @Req() req: { user: AppUser },
    @Body() dto: TestMailAccountDto,
  ) {
    return this.mailAccounts.testMine(req.user, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  deleteMine(@Req() req: { user: AppUser }) {
    return this.mailAccounts.deleteMine(req.user);
  }
}
