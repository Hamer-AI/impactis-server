/** Minimal user shape from auth session (e.g. Better Auth). Use for repository calls that need user id/email. */
export type SessionUser = {
    id: string
    email?: string | null
    last_sign_in_at?: string | null
}

export type UserProfile = {
    id: string
    full_name: string | null
    location: string | null
    bio: string | null
    avatar_url: string | null
    phone: string | null
    headline: string | null
    website_url: string | null
    linkedin_url: string | null
    timezone_name: string | null
    preferred_contact_method: 'email' | 'phone' | 'linkedin' | null
}
