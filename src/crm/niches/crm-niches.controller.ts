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
import type { AppUser } from '../../auth/types/app-user';
import { CrmNichesService } from './crm-niches.service';
import { CreateCrmNicheDto } from './dto/create-crm-niche.dto';
import { UpdateCrmNicheDto } from './dto/update-crm-niche.dto';

@Controller('crm/niches')
@UseGuards(AuthGuard('jwt'))
export class CrmNichesController {
  constructor(private readonly niches: CrmNichesService) {}

  @Get()
  list(@Req() req: { user: AppUser }) {
    return this.niches.list(req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: { user: AppUser }, @Body() dto: CreateCrmNicheDto) {
    return this.niches.create(req.user, dto);
  }

  @Patch(':id')
  update(
    @Req() req: { user: AppUser },
    @Param('id') id: string,
    @Body() dto: UpdateCrmNicheDto,
  ) {
    return this.niches.update(req.user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: { user: AppUser }, @Param('id') id: string) {
    await this.niches.remove(req.user, id);
  }
}
