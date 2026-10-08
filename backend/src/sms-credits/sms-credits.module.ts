import { Module } from '@nestjs/common';
import { SmsCreditsController } from './sms-credits.controller';
import { SmsCreditsService } from './sms-credits.service';

@Module({
  controllers: [SmsCreditsController],
  providers: [SmsCreditsService],
})
export class SmsCreditsModule {}
