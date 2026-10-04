import { Module } from '@nestjs/common';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { WarrantyCardsModule } from '../warranty-cards/warranty-cards.module';

@Module({
  imports: [WarrantyCardsModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
