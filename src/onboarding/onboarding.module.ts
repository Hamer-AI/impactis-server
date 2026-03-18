import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ReadinessGuard } from './readiness.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, ReadinessGuard],
  exports: [OnboardingService, ReadinessGuard],
})
export class OnboardingModule {}

