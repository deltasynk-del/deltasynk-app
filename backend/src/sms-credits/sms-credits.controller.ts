import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Permission } from '../access/permissions';
import { RequirePermissions } from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { GrantCreditsDto } from './dto/sms-credits.dto';
import { SmsCreditsService } from './sms-credits.service';

@Controller('sms-credits')
export class SmsCreditsController {
  constructor(private readonly credits: SmsCreditsService) {}

  @Get('shops')
  @RequirePermissions(Permission.TOPUPS_GRANT)
  shops(@Query('q') q?: string) {
    return this.credits.findShops(q);
  }

  @Post('grants')
  @RequirePermissions(Permission.TOPUPS_GRANT)
  @HttpCode(HttpStatus.OK)
  grant(@CurrentUser() actor: AuthenticatedUser, @Body() dto: GrantCreditsDto) {
    return this.credits.grant(actor, dto);
  }
}
