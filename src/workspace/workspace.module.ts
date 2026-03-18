import { Module } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';
import { DiscoveryController } from './discovery.controller';
import { WorkspaceService } from './workspace.service';
import { ReadinessModule } from '../readiness/readiness.module';
import { BillingModule } from '../billing/billing.module';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [ReadinessModule, BillingModule, OnboardingModule],
  controllers: [WorkspaceController, DiscoveryController],
  providers: [WorkspaceService],
})
export class WorkspaceModule {}
