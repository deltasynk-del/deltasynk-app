import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { SubscriptionsController } from './subscriptions.controller';
import { TopUpsController } from './top-ups.controller';

@Module({
  controllers: [SubscriptionsController, TopUpsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
