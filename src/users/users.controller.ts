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
import { AuthGuard } from '@nestjs/passport';
import type { AppUser } from '../auth/types/app-user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  updateMe(@Req() req: { user: AppUser }, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(req.user, dto);
  }

  /**
   * Liste employés + online (présence mémoire) + lastSeen (DB).
   * Auth : admin + admin_whatsapp.
   */
  @Get()
  list(@Req() req: { user: AppUser }) {
    return this.users.list(req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: { user: AppUser }, @Body() dto: CreateUserDto) {
    return this.users.create(req.user, dto);
  }

  /** Admin only — mise à jour employé. */
  @Patch(':id')
  update(
    @Req() req: { user: AppUser },
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(req.user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: { user: AppUser }, @Param('id') id: string) {
    await this.users.remove(req.user, id);
  }
}
