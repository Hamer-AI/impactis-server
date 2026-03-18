## Onboarding & Readiness API (v1)

### Auth
- **Required**: `Authorization: Bearer <better-auth-jwt>`

### Readiness enforcement
Some feature endpoints are gated by readiness (Discovery, Connections, Startup Data Room):
- If blocked, backend returns **403** with payload:

```json
{
  "statusCode": 403,
  "message": "Forbidden",
  "error": "Forbidden",
  "code": "READINESS_BLOCKED",
  "requiredScore": 100,
  "score": 65,
  "missing": ["onboarding.step1", "profile.avatar_url"],
  "message": "Complete onboarding and profile setup before using this feature."
}
```

### Endpoints

#### `GET /api/v1/onboarding/me`
Returns org context + gating state + latest scores.

**Response (200)**:

```json
{
  "user_id": "uuid",
  "org_id": "uuid",
  "org_type": "startup",
  "onboarding": {
    "step1_completed": true,
    "onboarding_completed": true,
    "blocked": false,
    "missing": []
  },
  "scores": {
    "overall_score": 100,
    "onboarding_score": 100,
    "profile_score": 100,
    "verification_score": 0,
    "activity_score": 0,
    "missing_fields": ["verification.status", "activity"],
    "score_details": { "weights": { "onboarding": 0.4 } },
    "calculated_at": "2026-03-18T12:34:56.000Z"
  }
}
```

Notes:
- Server performs **best-effort legacy migration** from `users.raw_user_meta_data` to avoid locking out existing users.

#### `POST /api/v1/onboarding/step1`
Persists the role’s **required Step 1** payload and marks step 1 as completed.

**Request**:

```json
{
  "role": "startup",
  "values": {
    "legal_name": "Acme Inc",
    "website_url": "https://acme.example",
    "company_email": "founder@acme.example",
    "elevator_pitch": "We build ..."
  }
}
```

**Response (200)**:

```json
{
  "success": true,
  "me": { "...": "same shape as GET /onboarding/me" }
}
```

Validation rules (server-side, minimal and permissive):
- **startup**: requires an identity field (`legal_name`/`trading_name`/`company_name`) and a contact/link (`website_url`/`company_email`/`linkedin_company_url`).
- **investor**: requires identity (`entity_name`/`full_name`) and contact/link (`email`/`linkedin_url`/`website_url`).
- **advisor**: requires identity (`professional_title`/`full_name`/`firm_name`) and contact/link (`email`/`linkedin_url`/`website_url`).

#### `POST /api/v1/onboarding/progress`
Writes onboarding step progress status.

**Request**:

```json
{
  "stepKey": "questionnaire",
  "stepNumber": 2,
  "status": "completed"
}
```

**Response (200)**:

```json
{
  "success": true,
  "me": { "...": "same shape as GET /onboarding/me" }
}
```

#### `PUT /api/v1/onboarding/answers`
Upserts questionnaire answers (partial allowed) to role-specific onboarding tables. Also records `questionnaire` step completion/skipping if provided.

**Request**:

```json
{
  "role": "investor",
  "answers": {
    "industry_preferences": [{ "industry": "FinTech", "rank": 1 }],
    "notification_threshold": "85+"
  },
  "completed": true,
  "skipped": false,
  "score": 72
}
```

**Response (200)**:

```json
{
  "success": true,
  "me": { "...": "same shape as GET /onboarding/me" }
}
```

#### `GET /api/v1/onboarding/score`
Returns latest computed score snapshot for the user’s org.

**Response (200)**:

```json
{
  "overall_score": 82,
  "onboarding_score": 100,
  "profile_score": 60,
  "verification_score": 0,
  "activity_score": 0,
  "missing_fields": ["profile.avatar_url", "verification.status", "activity"],
  "score_details": {},
  "calculated_at": "2026-03-18T12:34:56.000Z"
}
```

