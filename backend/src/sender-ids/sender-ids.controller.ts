import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '../access/permissions';
import { RequirePermissions } from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { ApproveDto, RejectDto } from './dto/review.dto';
import { SenderIdsService } from './sender-ids.service';

@Controller('sender-ids')
export class SenderIdsController {
  constructor(private readonly senderIds: SenderIdsService) {}

  @Get()
  @RequirePermissions(Permission.SENDER_IDS_VIEW)
  list(
    @Query('status') status?: string,
    @Query('app') app?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.senderIds.list({ status, app, q, page, pageSize });
  }

  @Post(':id/approve')
  @RequirePermissions(Permission.SENDER_IDS_REVIEW)
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDto,
  ) {
    return this.senderIds.approve(actor, id, dto.note);
  }

  @Post(':id/reject')
  @RequirePermissions(Permission.SENDER_IDS_REVIEW)
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDto,
  ) {
    return this.senderIds.reject(actor, id, dto.note);
  }

  @Post(':id/retry-delivery')
  @RequirePermissions(Permission.SENDER_IDS_REVIEW)
  @HttpCode(HttpStatus.OK)
  retry(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.senderIds.retryDelivery(actor, id);
  }
}
