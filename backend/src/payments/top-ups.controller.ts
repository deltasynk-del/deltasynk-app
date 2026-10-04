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
import { PaymentKind } from '@prisma/client';
import { Permission } from '../access/permissions';
import { RequirePermissions } from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { ApproveDto, RejectDto } from '../sender-ids/dto/review.dto';
import { PaymentsService } from './payments.service';

@Controller('top-ups')
export class TopUpsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(Permission.TOPUPS_VIEW)
  list(
    @Query('status') status?: string,
    @Query('app') app?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.payments.list(PaymentKind.SMS_TOPUP, { status, app, q, page, pageSize });
  }

  @Post(':id/verify')
  @RequirePermissions(Permission.TOPUPS_VERIFY)
  @HttpCode(HttpStatus.OK)
  verify(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDto,
  ) {
    return this.payments.verify(actor, PaymentKind.SMS_TOPUP, id, dto.note);
  }

  @Post(':id/reject')
  @RequirePermissions(Permission.TOPUPS_VERIFY)
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDto,
  ) {
    return this.payments.reject(actor, PaymentKind.SMS_TOPUP, id, dto.note);
  }
}
