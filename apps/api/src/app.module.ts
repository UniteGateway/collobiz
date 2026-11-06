import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DbModule } from './db/client';
import { AuditModule } from './common/audit.service';
import { AdaptersModule } from './common/adapters';
import { AuthGuard } from './common/auth.guard';
import { AllExceptionsFilter } from './common/http';
import { IdempotencyInterceptor } from './common/idempotency';
import { SystemModule } from './modules/system/system.controller';
import { PublicEnquiryController } from './modules/support/public-enquiry.controller';
import { config } from './config';

export const FEATURE_MODULES = [SystemModule];

@Module({
  imports: [
    DbModule,
    AuditModule,
    AdaptersModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: config().NODE_ENV === 'test' ? 10_000 : 300 }]),
    ...FEATURE_MODULES,
  ],
  controllers: [PublicEnquiryController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
