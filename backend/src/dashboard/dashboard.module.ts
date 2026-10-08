import { Module } from '@nestjs/common';
import { WebsiteModule } from '../website/website.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [WebsiteModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
