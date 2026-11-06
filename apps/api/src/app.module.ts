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
import { IdentityModule } from './modules/identity/identity.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { CatalogModule } from './modules/catalog/catalog.controller';
import { OpportunitiesModule } from './modules/opportunities/opportunities.controller';
import { LeadsModule } from './modules/leads/leads.controller';
import { config } from './config';

export const FEATURE_MODULES = [SystemModule, IdentityModule, OnboardingModule, CatalogModule, OpportunitiesModule, LeadsModule];

@Module({
  imports: [
    DbModule,
    AuditModule,
    AdaptersModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      // Tests opt in to rate limiting per request so suites can log in many personas quickly.
      skipIf: (ec) => config().NODE_ENV === 'test' && !ec.switchToHttp().getRequest().headers['x-enforce-throttle'],
    }),
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
