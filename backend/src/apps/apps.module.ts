import { Global, Module } from '@nestjs/common';
import { AppKeyGuard } from './app-key.guard';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';

@Global()
@Module({
  controllers: [AppsController],
  providers: [AppsService, AppKeyGuard],
  exports: [AppsService, AppKeyGuard],
})
export class AppsModule {}
