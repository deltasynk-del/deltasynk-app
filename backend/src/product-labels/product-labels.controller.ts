import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permission } from '../access/permissions';
import { RequirePermissions } from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { SaveLabelBatchDto, VoidLabelBatchDto } from './dto/product-labels.dto';
import { ProductLabelsService } from './product-labels.service';

@Controller('product-labels')
export class ProductLabelsController {
  constructor(private readonly labels: ProductLabelsService) {}

  @Get()
  @RequirePermissions(Permission.PRODUCT_LABELS_VIEW)
  list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.labels.list({ status, q, page, pageSize });
  }

  @Get(':id')
  @RequirePermissions(Permission.PRODUCT_LABELS_VIEW)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.labels.get(id);
  }

  @Post()
  @RequirePermissions(Permission.PRODUCT_LABELS_MANAGE)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: SaveLabelBatchDto) {
    return this.labels.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PRODUCT_LABELS_MANAGE)
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveLabelBatchDto) {
    return this.labels.update(actor, id, dto);
  }

  @Post(':id/void')
  @RequirePermissions(Permission.PRODUCT_LABELS_MANAGE)
  @HttpCode(HttpStatus.OK)
  void(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidLabelBatchDto) {
    return this.labels.void(actor, id, dto);
  }
}
