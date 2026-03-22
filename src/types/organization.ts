export type OrganizationType = 'startup' | 'investor' | 'advisor'
export type OrganizationMemberRole = 'owner' | 'admin' | 'member'
export type OrganizationMembershipStatus = 'pending' | 'active' | 'left' | 'removed' | 'expired' | 'cancelled'
export type OrganizationVerificationStatus = 'unverified' | 'pending' | 'approved' | 'rejected'
export type OrganizationLifecycleStatus = 'active' | 'suspended' | 'deleted'
export type OrganizationCapability = 'advisor_intro_send' | 'investor_intro_receive' | 'investor_intro_accept'
export type OrganizationCapabilityGateReason = 'ok' | 'missing_membership' | 'wrong_org_type' | 'verification_required'
export type OrganizationInviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled' | 'revoked'

export type Organization = {
    id: string
    type: OrganizationType
    name: string
    location: string | null
    logo_url: string | null
    industry_tags: string[]
    created_at: string
}

export type OrganizationVerification = {
    org_id: string
    status: OrganizationVerificationStatus
    reviewed_by: string | null
    reviewed_at: string | null
    notes: string | null
}

export type OrganizationMembership = {
    org_id: string
    user_id: string
    member_role: OrganizationMemberRole
    status: OrganizationMembershipStatus
    created_at: string
    organization: Organization
}

export type OrganizationMemberDirectoryEntry = {
    user_id: string
    member_role: OrganizationMemberRole
    status: OrganizationMembershipStatus
    joined_at: string | null
    full_name: string | null
    avatar_url: string | null
    location: string | null
}

export type OrganizationInvite = {
    id: string
    org_id: string
    organization_name: string
    organization_type: OrganizationType
    member_role: OrganizationMemberRole
    invited_email: string
    invited_by: string
    expires_at: string
    created_at: string
}

export type OrganizationOutgoingInvite = {
    id: string
    org_id: string
    invited_email: string
    member_role: OrganizationMemberRole
    status: OrganizationInviteStatus
    invited_by: string
    accepted_by: string | null
    expires_at: string
    created_at: string
    responded_at: string | null
}

export type OrganizationVerificationOverview = {
    organization: Organization
    verification: OrganizationVerification
}

export type OrganizationCapabilityGateResult = {
    capability: OrganizationCapability
    allowed: boolean
    reason: OrganizationCapabilityGateReason
    requiredOrganizationType: OrganizationType
    organizationType: OrganizationType | null
    verificationStatus: OrganizationVerificationStatus | null
    message: string
}

export type CreateOrganizationInput = {
    type: OrganizationType
    name: string
    location?: string | null
    industryTags?: string[]
}
