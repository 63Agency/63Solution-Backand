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
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { PortalPipelinesService } from './portal-pipelines.service';

@Controller('client/pipelines')
@UseGuards(ClientJwtGuard)
export class PortalPipelinesController {
  constructor(private readonly pipelines: PortalPipelinesService) {}

  @Get()
  list(@Req() req: { user: PortalClientUser }) {
    return this.pipelines.list(req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreatePipelineDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.pipelines.create(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePipelineDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.pipelines.update(id, dto, req.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Req() req: { user: PortalClientUser },
  ) {
    await this.pipelines.remove(id, req.user);
  }
}
