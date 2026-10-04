import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  AllowPasswordChangePending,
  AnyUser,
  Public,
} from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { clientIp } from '../common/utils/request.util';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/password.dto';
import { UpdateSelfProfileDto } from './dto/profile.dto';
import { SendLoginOtpDto, VerifyLoginOtpDto } from './dto/two-factor.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, clientIp(req));
  }

  @Post('login/2fa/send')
  @Public()
  @HttpCode(HttpStatus.OK)
  sendLoginTwoFactor(@Body() dto: SendLoginOtpDto) {
    return this.authService.sendLoginTwoFactorCode(dto.pendingToken, dto.method);
  }

  @Post('login/2fa/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  verifyLoginTwoFactor(@Body() dto: VerifyLoginOtpDto, @Req() req: Request) {
    return this.authService.completeTwoFactorLogin(dto, clientIp(req));
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @AnyUser()
  @AllowPasswordChangePending()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }

  @Patch('profile')
  @AnyUser()
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSelfProfileDto,
  ) {
    return this.authService.updateSelfProfile(user.id, dto);
  }

  @Post('change-password')
  @AnyUser()
  @AllowPasswordChangePending()
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }
}
