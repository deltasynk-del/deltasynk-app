import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '../access/permissions';
import { RequirePermissions } from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { AddonBodyDto, HardwareUpdateDto, PlanBodyDto } from './dto/website.dto';
import { WebsiteService } from './website.service';

@Controller('website')
export class WebsiteController {
  constructor(private readonly website: WebsiteService) {}

  @Get('plans')
  @RequirePermissions(Permission.WEBSITE_VIEW)
  listPlans(@Query('service') service?: string) {
    return this.website.listPlans(service);
  }

  @Post('plans')
  @RequirePermissions(Permission.WEBSITE_MANAGE)
  createPlan(@CurrentUser() actor: AuthenticatedUser, @Body() dto: PlanBodyDto) {
    return this.website.createPlan(actor, dto);
  }

  @Patch('plans/:id')
  @RequirePermissions(Permission.WEBSITE_MANAGE)
  updatePlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlanBodyDto,
  ) {
    return this.website.updatePlan(actor, id, dto);
  }

  @Delete('plans/:id')
  @RequirePermissions(Permission.WEBSITE_MANAGE)
  deletePlan(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.website.deletePlan(actor, id);
  }

  @Get('addons')
  @RequirePermissions(Permission.WEBSITE_VIEW)
  listAddons(@Query('service') service?: string) {
    return this.website.listAddons(service);
  }

  @Post('addons')
  @RequirePermissions(Permission.WEBSITE_MANAGE)
  createAddon(@CurrentUser() actor: AuthenticatedUser, @Body() dto: AddonBodyDto) {
    return this.website.createAddon(actor, dto);
  }

  @Patch('addons/:id')
  @RequirePermissions(Permission.WEBSITE_MANAGE)
  updateAddon(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddonBodyDto,
  ) {
    return this.website.updateAddon(actor, id, dto);
  }

  @Delete('addons/:id')
  @RequirePermissions(Permission.WEBSITE_MANAGE)
  deleteAddon(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.website.deleteAddon(actor, id);
  }

  @Get('hardware')
  @RequirePermissions(Permission.HARDWARE_VIEW)
  listHardware(@Query('service') service?: string, @Query('status') status?: string) {
    return this.website.listHardware({ service, status });
  }

  @Patch('hardware/:id')
  @RequirePermissions(Permission.HARDWARE_MANAGE)
  updateHardware(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HardwareUpdateDto,
  ) {
    return this.website.updateHardware(actor, id, dto);
  }
}
