import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingModule } from '../billing/billing.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { SyndicatesController } from './syndicates.controller';
import { SyndicatesService } from './syndicates.service';

@Module({
  imports: [PrismaModule, BillingModule, OnboardingModule],
  controllers: [SyndicatesController],
  providers: [SyndicatesService],
  exports: [SyndicatesService],
})
export class SyndicatesModule {}

