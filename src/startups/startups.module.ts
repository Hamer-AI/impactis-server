import { Module } from '@nestjs/common';
import { StartupsController } from './startups.controller';
import { StartupsService } from './startups.service';
import { ReadinessModule } from '../readiness/readiness.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [ReadinessModule, CapabilitiesModule, OnboardingModule, AiModule],
  controllers: [StartupsController],
  providers: [StartupsService],
})
export class StartupsModule {}
