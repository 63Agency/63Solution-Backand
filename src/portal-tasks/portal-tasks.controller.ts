import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientJwtGuard } from '../client-auth/client-jwt.guard';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { PortalTasksService } from './portal-tasks.service';

@Controller('client/tasks')
@UseGuards(ClientJwtGuard)
export class PortalTasksController {
  constructor(private readonly tasks: PortalTasksService) {}

  @Get()
  list(
    @Query() query: ListTasksQueryDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.tasks.list(req.user, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTaskDto, @Req() req: { user: PortalClientUser }) {
    return this.tasks.create(dto, req.user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
    @Req() req: { user: PortalClientUser },
  ) {
    return this.tasks.updateStatus(id, dto, req.user);
  }

  @Patch(':id/remind')
  remind(@Param('id') id: string, @Req() req: { user: PortalClientUser }) {
    return this.tasks.remind(id, req.user);
  }
}
