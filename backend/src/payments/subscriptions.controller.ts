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

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(Permission.SUBSCRIPTIONS_VIEW)
  list(
    @Query('status') status?: string,
    @Query('app') app?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.payments.list(PaymentKind.SUBSCRIPTION, { status, app, q, page, pageSize });
  }

  @Post(':id/verify')
  @RequirePermissions(Permission.SUBSCRIPTIONS_VERIFY)
  @HttpCode(HttpStatus.OK)
  verify(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDto,
  ) {
    return this.payments.verify(actor, PaymentKind.SUBSCRIPTION, id, dto.note);
  }

  @Post(':id/reject')
  @RequirePermissions(Permission.SUBSCRIPTIONS_VERIFY)
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDto,
  ) {
    return this.payments.reject(actor, PaymentKind.SUBSCRIPTION, id, dto.note);
  }
}
