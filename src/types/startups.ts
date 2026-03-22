export type StartupPostStatus = 'draft' | 'published'
export type StartupDataRoomDocumentType =
    | 'pitch_deck'
    | 'financial_doc'
    | 'legal_doc'
    | 'financial_model'
    | 'cap_table'
    | 'traction_metrics'
    | 'legal_company_docs'
    | 'incorporation_docs'
    | 'customer_contracts_summaries'
    | 'term_sheet_drafts'
export type StartupReadinessStep =
    | 'upload_pitch_deck'
    | 'add_team_info'
    | 'upload_financial_doc'
    | 'upload_legal_doc'
    | 'complete_profile_70'
    | 'reach_score_60'
    | 'upload_required_docs'
export type StartupPitchDeckMediaKind = 'document' | 'video'
export type StartupDiscoveryVerificationStatus = 'unverified' | 'pending' | 'approved' | 'rejected'
export type StartupReadinessSection = 'team' | 'product' | 'market' | 'traction' | 'financials' | 'legal' | 'pitch_materials'
export type StartupReadinessSectionScore = {
    section: StartupReadinessSection | string
    weight: number
    completion_percent: number
    score_contribution: number
}

export type StartupReadiness = {
    startup_org_id: string
    has_startup_post: boolean
    has_pitch_deck: boolean
    has_team_info: boolean
    has_financial_doc: boolean
    has_legal_doc: boolean
    profile_completion_percent: number
    readiness_score: number
    required_docs_uploaded: boolean
    eligible_for_discovery_post: boolean
    is_ready: boolean
    missing_steps: StartupReadinessStep[]
    section_scores: StartupReadinessSectionScore[]
}

export type StartupProfile = {
    startup_org_id: string
    website_url: string | null
    pitch_deck_url: string | null
    pitch_deck_media_kind: StartupPitchDeckMediaKind | null
    pitch_deck_file_name: string | null
    pitch_deck_file_size_bytes: number | null
    team_overview: string | null
    company_stage: string | null
    founding_year: number | null
    team_size: number | null
    target_market: string | null
    business_model: string | null
    traction_summary: string | null
    financial_summary: string | null
    legal_summary: string | null
    financial_doc_url: string | null
    financial_doc_file_name: string | null
    financial_doc_file_size_bytes: number | null
    legal_doc_url: string | null
    legal_doc_file_name: string | null
    legal_doc_file_size_bytes: number | null
    updated_at: string | null
}

export type StartupPost = {
    id: string
    startup_org_id: string
    title: string
    summary: string
    stage: string | null
    location: string | null
    industry_tags: string[]
    status: StartupPostStatus
    published_at: string | null
    updated_at: string
}

export type StartupDiscoveryFeedItem = {
    id: string
    startup_org_id: string
    startup_org_name: string
    title: string
    summary: string
    stage: string | null
    location: string | null
    industry_tags: string[]
    published_at: string | null
    startup_verification_status: StartupDiscoveryVerificationStatus
}

export type StartupDataRoomDocument = {
    id: string
    startup_org_id: string
    document_type: StartupDataRoomDocumentType
    title: string
    file_url: string
    storage_bucket: string | null
    storage_object_path: string | null
    file_name: string | null
    file_size_bytes: number | null
    content_type: string | null
    summary: string | null
    created_at: string
    updated_at: string
}
