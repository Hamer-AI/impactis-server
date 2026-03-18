import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { BillingStripeService } from './billing-stripe.service';
import { BillingService } from './billing.service';
import { CreateStripeCheckoutSessionInput } from './billing.types';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

interface RequestWithUser {
  user?: AuthenticatedUser;
  rawBody?: Buffer;
}

@Controller({ path: 'billing', version: ['1', VERSION_NEUTRAL] })
export class BillingAliasController {
  constructor(
    private readonly billing: BillingService,
    private readonly stripe: BillingStripeService,
    private readonly prisma: PrismaService,
  ) {}

  // v3 contract: POST /api/billing/checkout/stripe
  @Post('checkout/stripe')
  @UseGuards(BetterAuthJwtGuard)
  async checkoutStripe(@Req() req: RequestWithUser, @Body() input: CreateStripeCheckoutSessionInput) {
    const user = req.user;
    if (!user) return { success: false, message: 'Unauthorized', redirectUrl: null };
    return this.stripe.createCheckoutSessionForUser({
      userId: user.id,
      userEmail: user.email ?? null,
      checkout: input,
    });
  }

  // v3 contract: POST /api/billing/checkout/telebirr (stub)
  @Post('checkout/telebirr')
  @UseGuards(BetterAuthJwtGuard)
  async checkoutTelebirr(@Req() req: RequestWithUser, @Body() input: CreateStripeCheckoutSessionInput) {
    const user = req.user;
    if (!user) return { success: false, message: 'Unauthorized' };
    const tx = await this.billing.createPendingOffsitePaymentForUser({
      userId: user.id,
      provider: 'telebirr',
      planCode: input.planCode,
      billingInterval: input.billingInterval ?? null,
    });
    return {
      success: true,
      message: 'Telebirr payment initialized (demo).',
      transactionId: tx.transactionId,
      amount_cents: tx.amount_cents,
      currency: tx.currency,
    };
  }

  // v3 contract: POST /api/billing/checkout/mpesa (stub)
  @Post('checkout/mpesa')
  @UseGuards(BetterAuthJwtGuard)
  async checkoutMpesa(@Req() req: RequestWithUser, @Body() input: CreateStripeCheckoutSessionInput) {
    const user = req.user;
    if (!user) return { success: false, message: 'Unauthorized' };
    const tx = await this.billing.createPendingOffsitePaymentForUser({
      userId: user.id,
      provider: 'mpesa',
      planCode: input.planCode,
      billingInterval: input.billingInterval ?? null,
    });
    return {
      success: true,
      message: 'M-Pesa payment initialized (demo).',
      transactionId: tx.transactionId,
      amount_cents: tx.amount_cents,
      currency: tx.currency,
    };
  }

  // v3 contract: POST /api/billing/webhook/stripe (alias of existing /billing/stripe/webhook)
  @Post('webhook/stripe')
  @HttpCode(200)
  async stripeWebhookAlias(
    @Req() req: RequestWithUser,
    @Headers('stripe-signature') stripeSignature?: string,
  ) {
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : null;
    if (!rawBody) return { received: false, message: 'Missing raw request body' };
    return this.stripe.handleWebhook({ rawBody, stripeSignature: stripeSignature ?? null });
  }

  // v3 contract: POST /api/billing/webhook/telebirr (stub)
  @Post('webhook/telebirr')
  @HttpCode(200)
  async telebirrWebhook(@Req() req: any) {
    const payload = req?.body ?? {};
    const eventId = typeof payload?.event_id === 'string' ? payload.event_id : `telebirr_${randomUUID()}`;
    const eventType = typeof payload?.event_type === 'string' ? payload.event_type : 'telebirr.webhook';
    await this.prisma.$queryRaw`
      insert into public.billing_webhook_events (provider, event_id, event_type, livemode, payload)
      values ('telebirr', ${eventId}, ${eventType}, false, ${payload}::jsonb)
      on conflict (provider, event_id) do nothing
    `;
    return { received: true, message: 'Telebirr webhook recorded.' };
  }

  // v3 contract: POST /api/billing/webhook/mpesa (stub)
  @Post('webhook/mpesa')
  @HttpCode(200)
  async mpesaWebhook(@Req() req: any) {
    const payload = req?.body ?? {};
    const eventId = typeof payload?.event_id === 'string' ? payload.event_id : `mpesa_${randomUUID()}`;
    const eventType = typeof payload?.event_type === 'string' ? payload.event_type : 'mpesa.webhook';
    await this.prisma.$queryRaw`
      insert into public.billing_webhook_events (provider, event_id, event_type, livemode, payload)
      values ('mpesa', ${eventId}, ${eventType}, false, ${payload}::jsonb)
      on conflict (provider, event_id) do nothing
    `;
    return { received: true, message: 'M-Pesa webhook recorded.' };
  }

  // v3 contract: GET /api/billing/subscription
  @Get('subscription')
  @UseGuards(BetterAuthJwtGuard)
  async subscription(@Req() req: RequestWithUser) {
    const user = req.user;
    if (!user) return null;
    return this.billing.getCurrentPlanForUser(user.id);
  }

  // v3 contract: GET /api/billing/transactions
  @Get('transactions')
  @UseGuards(BetterAuthJwtGuard)
  async transactions(@Req() req: RequestWithUser, @Query('limit') limitRaw?: string) {
    const user = req.user;
    if (!user) return [];
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : 100;
    return this.billing.listTransactionsForUser(user.id, Number.isFinite(limit) ? limit : 100);
  }
}

