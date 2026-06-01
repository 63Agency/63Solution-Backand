import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { AppUser } from '../auth/types/app-user';
import { MULTIPLE_MAX_FILES } from './cloudinary.constants';
import { CloudinaryService } from './cloudinary.service';
import { DeleteMediaQueryDto } from './dto/delete-media-query.dto';
import { UploadFolderQueryDto } from './dto/upload-query.dto';
import { TransformQueryDto } from './dto/transform-query.dto';
import { TransformationOptionsDto } from './dto/transformation-options.dto';
import {
  multerOptionsFor,
  multerOptionsForMultiple,
} from './utils/multer-options';

@Controller('upload')
@UseGuards(AuthGuard('jwt'))
export class CloudinaryController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @Get('media')
  listMedia(
    @Req() req: { user: AppUser },
    @Query() query: UploadFolderQueryDto,
  ) {
    return this.cloudinary.listMedia(req.user, query.folder);
  }

  @Post('image')
  @UseInterceptors(FileInterceptor('file', multerOptionsFor('image')))
  uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: { user: AppUser },
    @Query() query: UploadFolderQueryDto,
  ) {
    if (!file) {
      throw new BadRequestException({ message: 'Champ "file" requis' });
    }
    return this.cloudinary.uploadAndSaveImage(file, req.user, query.folder);
  }

  @Post('video')
  @UseInterceptors(FileInterceptor('file', multerOptionsFor('video')))
  uploadVideo(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: { user: AppUser },
    @Query() query: UploadFolderQueryDto,
  ) {
    if (!file) {
      throw new BadRequestException({ message: 'Champ "file" requis' });
    }
    return this.cloudinary.uploadAndSaveVideo(file, req.user, query.folder);
  }

  @Post('multiple')
  @UseInterceptors(
    FilesInterceptor('files', MULTIPLE_MAX_FILES, multerOptionsForMultiple()),
  )
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: { user: AppUser },
    @Query() query: UploadFolderQueryDto,
  ) {
    const list = files ?? [];
    if (!list.length) {
      throw new BadRequestException({ message: 'Champ "files" requis' });
    }
    const items = await this.cloudinary.uploadAndSaveMultiple(
      list,
      req.user,
      query.folder,
    );
    return { items };
  }

  @Get('transform')
  getTransformQuery(@Query() query: TransformQueryDto) {
    if (!query.publicId?.trim()) {
      throw new BadRequestException({ message: 'Query publicId requis' });
    }
    const { publicId, ...options } = query;
    return this.cloudinary.getTransform(publicId!, options);
  }

  @Get('transform/:publicId')
  getTransformParam(
    @Param('publicId') publicId: string,
    @Query() options: TransformationOptionsDto,
  ) {
    return this.cloudinary.getTransform(publicId, options);
  }

  @Delete()
  deleteQuery(
    @Query() query: DeleteMediaQueryDto,
    @Req() req: { user: AppUser },
  ) {
    return this.cloudinary.removeForUser(query.publicId, req.user);
  }

  @Delete(':publicId')
  deleteParam(
    @Param('publicId') publicId: string,
    @Req() req: { user: AppUser },
  ) {
    return this.cloudinary.removeForUser(publicId, req.user);
  }
}
