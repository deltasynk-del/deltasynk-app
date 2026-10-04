import { Module } from '@nestjs/common';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { WarrantyCardsModule } from '../warranty-cards/warranty-cards.module';
import { ProductLabelsModule } from '../product-labels/product-labels.module';

@Module({
  imports: [WarrantyCardsModule, ProductLabelsModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
