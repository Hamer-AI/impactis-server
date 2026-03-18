## Deal Room API (v1)

### Auth
- **Required**: `Authorization: Bearer <better-auth-jwt>`

### Readiness enforcement
Most mutating endpoints are readiness-gated. If blocked, backend returns **403** with:

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

### Error codes (Deal Room specific)
- `DEAL_ROOM_PERMISSION_DENIED`: caller is not allowed / not a participant.

## Deal discussion requests

### `POST /api/v1/deal-room/requests`
Investor starts a deal discussion with a startup.

**Body**:

```json
{
  "startupOrgId": "uuid",
  "message": "Optional message"
}
```

**Success (200)**: `DealRoomRequestView`

### `GET /api/v1/deal-room/requests/incoming`
Startup lists incoming pending requests.

**Success (200)**: `DealRoomRequestView[]`

### `POST /api/v1/deal-room/requests/:id/accept`
Startup accepts a request. Creates connection + deal room + participants + initial stage history.

**Success (200)**:

```json
{ "dealRoomId": "uuid" }
```

### `POST /api/v1/deal-room/requests/:id/reject`
Startup rejects a request.

**Body**:

```json
{ "note": "Optional note" }
```

**Success (200)**:

```json
{ "success": true }
```

## Deal rooms

### `GET /api/v1/deal-room`
Lists deal rooms for caller org.

**Success (200)**: `DealRoomView[]`

### `GET /api/v1/deal-room/:dealRoomId`
Room details + participants.

**Success (200)**:

```json
{ "room": { "...": "DealRoomView" }, "participants": [] }
```

## Messages

### `GET /api/v1/deal-room/:dealRoomId/messages`
Lists messages for a room (participants only).

**Success (200)**: `DealRoomMessageView[]`

### `POST /api/v1/deal-room/:dealRoomId/messages`
Sends a message (participants only).

**Body**:

```json
{ "body": "Hello" }
```

**Success (200)**: `DealRoomMessageView`

## Stages

### `POST /api/v1/deal-room/:dealRoomId/stage`
Updates deal stage and writes stage history.

**Body**:

```json
{ "stage": "due_diligence", "note": "Optional note" }
```

**Success (200)**:

```json
{ "success": true }
```

