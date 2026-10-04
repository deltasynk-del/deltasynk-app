import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/access.decorators';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check(): { status: string; service: string } {
    return { status: 'ok', service: 'deltasynk-portal-api' };
  }
}
