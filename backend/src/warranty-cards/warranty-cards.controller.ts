import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Permission } from '../access/permissions';
import { Public, RequirePermissions } from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { CreatePacksDto, VoidPackDto, WarrantyDesignDto } from './dto/warranty-cards.dto';
import { assertSide, MAX_DESIGN_IMAGE_BYTES, WarrantyCardsService } from './warranty-cards.service';

@Controller('warranty-cards')
export class WarrantyCardsController {
  constructor(private readonly cards: WarrantyCardsService) {}

  // Designs

  @Get('designs')
  @RequirePermissions(Permission.WARRANTY_CARDS_VIEW)
  listDesigns() {
    return this.cards.listDesigns();
  }

  @Post('designs')
  @RequirePermissions(Permission.WARRANTY_CARDS_MANAGE)
  createDesign(@CurrentUser() actor: AuthenticatedUser, @Body() dto: WarrantyDesignDto) {
    return this.cards.createDesign(actor, dto);
  }

  @Patch('designs/:id')
  @RequirePermissions(Permission.WARRANTY_CARDS_MANAGE)
  updateDesign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WarrantyDesignDto,
  ) {
    return this.cards.updateDesign(actor, id, dto);
  }

  @Delete('designs/:id')
  @RequirePermissions(Permission.WARRANTY_CARDS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDesign(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.cards.deleteDesign(actor, id);
  }

  /** Multipart upload, field name "image". */
  @Post('designs/:id/:side')
  @RequirePermissions(Permission.WARRANTY_CARDS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_DESIGN_IMAGE_BYTES, files: 1 } }))
  uploadImage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('side') side: string,
    @UploadedFile(new ParseFilePipeBuilder().build({ errorHttpStatusCode: HttpStatus.BAD_REQUEST, fileIsRequired: true }))
    file: Express.Multer.File,
  ) {
    return this.cards.setImage(actor, id, assertSide(side), file);
  }

  @Delete('designs/:id/:side')
  @RequirePermissions(Permission.WARRANTY_CARDS_MANAGE)
  removeImage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('side') side: string,
  ) {
    return this.cards.removeImage(actor, id, assertSide(side));
  }

  /**
   * The picture itself. Public because <img> tags can't send the sign-in token; the
   * design id is unguessable and the artwork is printed on cards handed to customers anyway.
   */
  @Get('designs/:id/:side')
  @Public()
  async image(@Param('id', ParseUUIDPipe) id: string, @Param('side') side: string, @Res() res: Response) {
    const image = await this.cards.getImage(id, assertSide(side));
    res.setHeader('Content-Type', image.type);
    // The URL carries ?v=<imageVersion>, so a new upload gets a new URL.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(image.data);
  }

  // Packs

  @Get('packs')
  @RequirePermissions(Permission.WARRANTY_CARDS_VIEW)
  listPacks(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.cards.listPacks({ status, q, page, pageSize });
  }

  @Post('packs')
  @RequirePermissions(Permission.WARRANTY_CARDS_MANAGE)
  createPacks(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreatePacksDto) {
    return this.cards.createPacks(actor, dto);
  }

  @Post('packs/:id/void')
  @RequirePermissions(Permission.WARRANTY_CARDS_MANAGE)
  @HttpCode(HttpStatus.OK)
  voidPack(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidPackDto,
  ) {
    return this.cards.voidPack(actor, id, dto);
  }

  /** ?runId= prints every pack generated together; ?packId= reprints one pack. */
  @Get('print')
  @RequirePermissions(Permission.WARRANTY_CARDS_VIEW)
  print(@Query('runId') runId?: string, @Query('packId') packId?: string) {
    return this.cards.printSheet({ runId, packId });
  }
}
