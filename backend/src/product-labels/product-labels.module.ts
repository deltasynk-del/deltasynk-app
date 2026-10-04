import { Module } from '@nestjs/common';
import { ProductLabelsController } from './product-labels.controller';
import { ProductLabelsService } from './product-labels.service';

@Module({
  controllers: [ProductLabelsController],
  providers: [ProductLabelsService],
  exports: [ProductLabelsService],
})
export class ProductLabelsModule {}
