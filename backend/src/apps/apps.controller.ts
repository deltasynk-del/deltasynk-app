import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { SourceApp } from '@prisma/client';
import { Permission } from '../access/permissions';
import { RequirePermissions } from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { AppsService } from './apps.service';
import { UpdateConnectedAppDto } from './dto/apps.dto';

@Controller('apps')
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  @Get()
  @RequirePermissions(Permission.APPS_VIEW)
  list() {
    return this.apps.list();
  }

  @Patch(':code')
  @RequirePermissions(Permission.APPS_MANAGE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('code', new ParseEnumPipe(SourceApp)) code: SourceApp,
    @Body() dto: UpdateConnectedAppDto,
  ) {
    return this.apps.update(actor, code, dto);
  }

  @Post(':code/rotate-key')
  @RequirePermissions(Permission.APPS_MANAGE)
  @HttpCode(HttpStatus.OK)
  rotateKey(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('code', new ParseEnumPipe(SourceApp)) code: SourceApp,
  ) {
    return this.apps.rotateInboundKey(actor, code);
  }
}
