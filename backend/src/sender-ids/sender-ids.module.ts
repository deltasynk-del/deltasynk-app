import { Module } from '@nestjs/common';
import { SenderIdsController } from './sender-ids.controller';
import { SenderIdsService } from './sender-ids.service';

@Module({
  controllers: [SenderIdsController],
  providers: [SenderIdsService],
  exports: [SenderIdsService],
})
export class SenderIdsModule {}
