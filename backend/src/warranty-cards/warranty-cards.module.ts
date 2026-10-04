import { Module } from '@nestjs/common';
import { WarrantyCardsController } from './warranty-cards.controller';
import { WarrantyCardsService } from './warranty-cards.service';

@Module({
  controllers: [WarrantyCardsController],
  providers: [WarrantyCardsService],
  exports: [WarrantyCardsService],
})
export class WarrantyCardsModule {}
