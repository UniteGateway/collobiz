import { Module } from '@nestjs/common';
import { AdminRiskController, AdminVerificationController, OnboardingController, PrivacyController, ProfileController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({ controllers: [OnboardingController, ProfileController, AdminVerificationController, AdminRiskController, PrivacyController], providers: [OnboardingService], exports: [OnboardingService] })
export class OnboardingModule {}
