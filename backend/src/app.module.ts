import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppsModule } from './apps/apps.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { IngestModule } from './ingest/ingest.module';
import { MailModule } from './mail/mail.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { SenderIdsModule } from './sender-ids/sender-ids.module';
import { SmsModule } from './sms/sms.module';
import { SmsCreditsModule } from './sms-credits/sms-credits.module';
import { UsersModule } from './users/users.module';
import { WebsiteModule } from './website/website.module';
import { WarrantyCardsModule } from './warranty-cards/warranty-cards.module';
import { ProductLabelsModule } from './product-labels/product-labels.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    SmsModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AppsModule,
    IngestModule,
    SenderIdsModule,
    PaymentsModule,
    SmsCreditsModule,
    WebsiteModule,
    DashboardModule,
    WarrantyCardsModule,
    ProductLabelsModule,
  ],
  providers: [
    // Order matters: authenticate first, then check what the user may do.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
