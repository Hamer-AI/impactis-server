export type BillingSegment = 'startup' | 'investor' | 'advisor'
export type BillingInterval = 'monthly' | 'annual'
export type BillingSubscriptionStatus =
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'paused'
    | 'canceled'
    | 'incomplete'

export type BillingPlanFeature = {
    key: string
    label: string
    value: string | null
    limit: number | null
    unlimited: boolean
}

export type BillingPlan = {
    segment: BillingSegment
    plan_code: string
    display_name: string
    tier: number
    is_default: boolean
    pricing: {
        currency: string
        monthly_price_cents: number | null
        annual_price_cents: number | null
    }
    features: BillingPlanFeature[]
}

export type BillingPlansSnapshot = {
    segment: BillingSegment | 'all'
    plans: BillingPlan[]
}

export type BillingCurrentPlanSnapshot = {
    org_id: string
    org_type: BillingSegment
    plan: {
        id: string
        code: string
        name: string
        tier: number
        currency: string
        monthly_price_cents: number | null
        annual_price_cents: number | null
    }
    subscription: {
        id: string | null
        status: BillingSubscriptionStatus | null
        billing_interval: BillingInterval | null
        started_at: string | null
        current_period_start: string | null
        current_period_end: string | null
        cancel_at_period_end: boolean
        canceled_at: string | null
        is_fallback_free: boolean
    }
}

export type BillingUsageCounter = {
    feature_key: string
    usage_count: number
    period_start: string
    period_end: string
}

export type BillingMeSnapshot = BillingCurrentPlanSnapshot & {
    usage: BillingUsageCounter[]
}

export type UpdateBillingSubscriptionInput = {
    planCode: string
    billingInterval?: BillingInterval | null
}

export type BillingSubscriptionMutationResult = {
    success: boolean
    message: string | null
    currentPlan: BillingCurrentPlanSnapshot | null
}

export type BillingStripeRedirectMode = 'manual_applied' | 'stripe_checkout' | 'stripe_portal'
export type CreateStripeCheckoutSessionInput = {
    planCode: string
    billingInterval?: BillingInterval | null
    successUrl?: string | null
    cancelUrl?: string | null
}
export type CreateStripePortalSessionInput = {
    returnUrl?: string | null
}
export type BillingStripeRedirectResult = {
    success: boolean
    message: string | null
    mode: BillingStripeRedirectMode | null
    redirectUrl: string | null
    currentPlan: BillingCurrentPlanSnapshot | null
}
