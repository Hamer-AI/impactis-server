## Data Room API (v1)

### Auth
- **Required**: `Authorization: Bearer <better-auth-jwt>`

### Readiness enforcement
Most endpoints below are protected by readiness gating. If blocked, backend returns **403** with:

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

### Error codes (Data Room specific)
- `CAPABILITY_BLOCKED`: the caller's plan does not include a required capability (e.g. `dataroom.view`).
- `DATA_ROOM_ACCESS_REQUIRED`: caller must request and be granted access first.
- `DATA_ROOM_PERMISSION_DENIED`: caller is not allowed to perform this action.

## Access requests

### `POST /api/v1/data-room/access-requests`
Investor/advisor requests access to a startup data room.

**Body**:

```json
{
  "startupOrgId": "uuid",
  "message": "Optional message"
}
```

**Success response (200)**: access request view.

### `GET /api/v1/data-room/access-requests/mine`
Lists the current org’s access requests (investor/advisor).

**Success response (200)**: `DataRoomAccessRequestView[]`

### `GET /api/v1/data-room/access-requests/incoming`
Lists incoming access requests for the current startup org.

**Success response (200)**: `DataRoomAccessRequestView[]`

### `POST /api/v1/data-room/access-requests/:requestId/approve`
Startup approves an access request.

**Body**:

```json
{
  "permissionLevel": "view",
  "expiresAt": null,
  "note": "Optional note"
}
```

Defaults:
- `permissionLevel` defaults to **`view`** (view-only).

**Success response (200)**: grant view.

### `POST /api/v1/data-room/access-requests/:requestId/reject`
Startup rejects an access request.

**Body**:

```json
{
  "note": "Optional note"
}
```

**Success response (200)**:

```json
{ "success": true }
```

### `POST /api/v1/data-room/access-grants/:grantId/revoke`
Startup revokes an existing grant.

**Body**:

```json
{
  "note": "Optional note"
}
```

**Success response (200)**:

```json
{ "success": true }
```

## Viewing contents (grant-gated)

### `GET /api/v1/data-room/startups/:startupOrgId/contents`
Returns startup folders + documents.

Rules:
- Startup members can view their own org contents.
- Non-owners must have:
  - capability `dataroom.view`
  - an active grant (not revoked/expired)

**Success response (200)**:

```json
{
  "startup_org_id": "uuid",
  "folders": [],
  "documents": [],
  "grant": null
}
```

**Forbidden (403)** if no grant:

```json
{
  "statusCode": 403,
  "message": "Forbidden",
  "error": "Forbidden",
  "code": "DATA_ROOM_ACCESS_REQUIRED",
  "message": "Request access to view this Data Room."
}
```

## Terms

### `POST /api/v1/data-room/startups/:startupOrgId/terms/accept`
Records `terms_accepted_at` on the active grant.

**Success response (200)**:

```json
{ "success": true }
```

## Analytics

### `POST /api/v1/data-room/documents/:documentId/view`
Upserts document view analytics (`data_room_document_views`) for the caller org.

**Body**:

```json
{ "seconds": 15 }
```

**Success response (200)**:

```json
{ "success": true }
```

