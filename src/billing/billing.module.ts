import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingAliasController } from './billing-alias.controller';
import { BillingStripeController } from './billing-stripe.controller';
import { BillingStripeService } from './billing-stripe.service';
import { BillingService } from './billing.service';
import { BillingUsageService } from './billing-usage.service';
import { CapabilitiesModule } from '../capabilities/capabilities.module';

@Module({
  imports: [CapabilitiesModule],
  controllers: [BillingController, BillingStripeController, BillingAliasController],
  providers: [BillingService, BillingStripeService, BillingUsageService],
  exports: [BillingService, BillingStripeService, BillingUsageService],
})
export class BillingModule {}
