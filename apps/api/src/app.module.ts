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
import { CrmModule } from './modules/crm/crm.controller';
import { CommissionsModule } from './modules/commissions/commissions.controller';
import { CommsModule } from './modules/comms/comms.controller';
import { GlobalModule } from './modules/global/global.controller';
import { GrowthModule } from './modules/growth/growth.controller';
import { HomeModule } from './modules/home/home.controller';
import { TradingModule } from './modules/trading/trading.controller';
import { ProjectsModule } from './modules/projects/projects.controller';
import { ContractsModule } from './modules/contracts/contracts.controller';
import { TendersModule } from './modules/tenders/tenders.controller';
import { TeamsModule } from './modules/teams/teams.controller';
import { OffersModule } from './modules/offers/offers.controller';
import { VenturesModule } from './modules/ventures/ventures.controller';
import { PilotModule } from './modules/pilot/pilot.controller';
import { GrowthDeskModule } from './modules/growth-desk/growth-desk.controller';
import { WorkspaceModule } from './modules/workspace/workspace.controller';
import { config } from './config';

export const FEATURE_MODULES = [SystemModule, IdentityModule, OnboardingModule, CatalogModule, OpportunitiesModule, LeadsModule, CrmModule, TeamsModule, TendersModule, ContractsModule, ProjectsModule, TradingModule, CommissionsModule, CommsModule, HomeModule, GrowthModule, GlobalModule, OffersModule, VenturesModule, PilotModule, GrowthDeskModule, WorkspaceModule];

@Module({
  imports: [
    DbModule,
    AuditModule,
    AdaptersModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: config().API_RATE_LIMIT }],
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
