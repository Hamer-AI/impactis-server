export interface ActiveSession {
    id: string;
    user_id: string;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
    updated_at: string;
}

export interface SessionListResponse {
    sessions: ActiveSession[];
}
