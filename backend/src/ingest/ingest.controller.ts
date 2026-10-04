import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AppKeyGuard, AppRequest } from '../apps/app-key.guard';
import { Public } from '../common/decorators/access.decorators';
import { IngestPaymentDto, IngestSenderIdDto } from './dto/ingest.dto';
import { IngestService } from './ingest.service';
import { ClaimPackDto } from '../warranty-cards/dto/warranty-cards.dto';
import { WarrantyCardsService } from '../warranty-cards/warranty-cards.service';

/**
 * App-to-portal API. No staff login: each app authenticates with its own
 * x-portal-api-key (generated under Connected apps) and can only see and write
 * its own records.
 */
@Controller('ingest')
@Public()
@UseGuards(AppKeyGuard)
export class IngestController {
  constructor(
    private readonly ingest: IngestService,
    private readonly warrantyCards: WarrantyCardsService,
  ) {}

  @Post('sender-ids')
  @HttpCode(HttpStatus.OK)
  upsertSenderId(@Req() req: AppRequest, @Body() dto: IngestSenderIdDto) {
    return this.ingest.upsertSenderId(req.sourceApp.code, dto);
  }

  @Get('sender-ids/:externalId')
  getSenderId(@Req() req: AppRequest, @Param('externalId') externalId: string) {
    return this.ingest.getSenderId(req.sourceApp.code, externalId);
  }

  @Post('payments')
  @HttpCode(HttpStatus.OK)
  upsertPayment(@Req() req: AppRequest, @Body() dto: IngestPaymentDto) {
    return this.ingest.upsertPayment(req.sourceApp.code, dto);
  }

  /** A shop owner entered a printed card pack's claim code: returns the pack's card numbers. */
  @Post('warranty-packs/claim')
  @HttpCode(HttpStatus.OK)
  claimWarrantyPack(@Req() req: AppRequest, @Body() dto: ClaimPackDto) {
    return this.warrantyCards.claim(req.sourceApp.code, dto);
  }

  @Get('payments/:reference')
  getPayment(@Req() req: AppRequest, @Param('reference') reference: string) {
    return this.ingest.getPayment(req.sourceApp.code, reference);
  }
}
