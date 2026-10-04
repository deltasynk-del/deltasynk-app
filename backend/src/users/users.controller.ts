import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Permission } from '../access/permissions';
import { RequirePermissions } from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(Permission.USERS_VIEW)
  list() {
    return this.users.list();
  }

  @Get('roles')
  @RequirePermissions(Permission.USERS_VIEW)
  roles() {
    return this.users.roles();
  }

  @Post()
  @RequirePermissions(Permission.USERS_MANAGE)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.USERS_MANAGE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }

  @Post(':id/reset-password')
  @RequirePermissions(Permission.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.resetPassword(actor, id);
  }

  @Post(':id/reset-2fa')
  @RequirePermissions(Permission.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  resetTwoFactor(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.resetTwoFactor(actor, id);
  }

  @Post(':id/unlock')
  @RequirePermissions(Permission.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  unlock(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.unlock(actor, id);
  }
}
