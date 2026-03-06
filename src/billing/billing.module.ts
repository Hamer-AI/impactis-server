import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingStripeController } from './billing-stripe.controller';
import { BillingStripeService } from './billing-stripe.service';
import { BillingService } from './billing.service';
import { CapabilitiesModule } from '../capabilities/capabilities.module';

@Module({
  imports: [CapabilitiesModule],
  controllers: [BillingController, BillingStripeController],
  providers: [BillingService, BillingStripeService],
  exports: [BillingService, BillingStripeService],
})
export class BillingModule {}
