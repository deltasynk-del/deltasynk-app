import { Controller, Get } from '@nestjs/common';
import { Permission } from '../access/permissions';
import { RequirePermissions } from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.summary(user);
  }

  /** Income, subscribers and website figures: heavier than the summary, so only the dashboard page asks. */
  @Get('insights')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  insights(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.insights(user);
  }
}
