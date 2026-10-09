# Disaster Warning Backend

Hazard-report photos are stored as actual files in MongoDB GridFS using the existing Mongoose connection. They are never embedded in `HazardReport` documents or submitted as Base64.

## Photo API

- `POST /api/uploads/hazard-photo` accepts one multipart file in the `file` field.
- `GET /api/uploads/hazard-photo/:fileId` streams a stored image.
- `DELETE /api/uploads/hazard-photo/:fileId` removes an uploaded file when report creation fails. It returns `409` if the photo is attached to a report (including a Needs More Information reply), so evidence an officer is reviewing can't be deleted.

Upload and GET stay public: anonymous citizens can still report hazards, and `<img>` tags can't send a login token. File ids are random ObjectIds.

Only JPEG, PNG, and WebP images with matching file signatures are accepted. The maximum size is 5 MB. `POST /api/hazard-reports` accepts an optional `photoFileId`, verifies that the GridFS file exists, and keeps status controlled by the backend with a default of `Pending Verification`.

Configure `MONGO_URI` and other server settings through the existing environment configuration. Do not commit credentials.

## Verify Hazard Report (Component 2)

DMC Duty Officers review pending hazard reports and mark them as Verified, Rejected or Needs More Information. Only the officer makes this decision; the system never changes a report's status on its own.

### Running

1. Copy `.env.example` to `.env` and set `MONGO_URI`, `JWT_SECRET`, `PORT`, and `CORS_ORIGINS` as needed. `CORS_ORIGINS` is a comma-separated list of browser origins; the defaults allow the admin app and Expo web development ports.
2. `npm install`
3. `npm run seed` adds 2 DMC officers, 2 citizens and 13 sample reports (one is waiting for the citizen to send more information). It only replaces its own seed data, so other data in the database is kept.
4. `npm run dev` (or `npm start`)

Seed logins (password `password123`): `officer@dmc.lk`, `officer2@dmc.lk`, `citizen1@example.lk`, `citizen2@example.lk`.

### Auth

| Method | Endpoint | Body |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ name, email, password, role?, district? }` |
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }` |

Roles: `Citizen` (default), `Volunteer`, `DMC Officer`, `District Officer`. Public registration only creates `Citizen` or `Volunteer` accounts; asking for an officer role returns `403`. Officer accounts come from the seed script (or an administrator). Send the token as `Authorization: Bearer <token>`.

### Endpoints (DMC Officer only)

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/officer/dashboard` | `{ pendingCount, overdueCount, statusCounts, recentActivity }` (last 5 decisions) |
| GET | `/api/reports` | Report list. Query: `status` (default `Pending Verification`), `hazardType`, `district`, `search` (report ID or description), `sort` (`newest` or `severity`), `page` (default 1), `limit` (default 20, max 100). Returns `{ count, total, page, pages, data }`; each item has `ageMinutes` and `overdue` |
| GET | `/api/reports/:id` | Full report, reporter name, verification history, `photoUrl`, `nearbyReports` (same hazard within ~5 km and 48 h, to spot duplicates) and `reporterHistory` (`{ total, verified, rejected }` of the reporter's other reports) |
| POST | `/api/reports/:id/verification` | `{ decision, remarks, checklist?, severity? }`. Decision is `Verified`, `Rejected` or `Needs More Information`. Remarks are required unless Verified (for Needs More Information they are the note shown to the citizen). See the decision rules below |
| POST | `/api/reports/:id/reopen` | `{ remarks }` (required). Sends a Rejected report back to `Pending Verification` and records a `Reopened` entry |
| GET | `/api/reports/:id/warning-draft` | For a Verified report, returns `{ headline, instruction, severity, targetAreas, channels, sourceReport }` to pre-fill the Issue Warning form. Severity maps High → `Warning`, Medium → `Watch`, Low → `Advisory` |

Decision rules:

- `checklist` is `{ locationChecked, evidenceReviewed, duplicatesChecked }`, all booleans. Unknown items or non-boolean values return `400`.
- **Verified** requires `locationChecked: true`, and also `evidenceReviewed: true` when the report has a photo or evidence. Rejected and Needs More Information don't need the checklist; the remarks explain the decision.
- `severity` (`Low`, `Medium` or `High`) is optional. If given it updates the report; either way the severity is stored on the `Verification` record.

A pending report is `overdue` when it has waited in the queue for more than 30 minutes since it was submitted, answered or reopened.

Error codes: `400` invalid id, query value, decision, checklist or severity, or missing remarks, `401` no or invalid token, `403` not a DMC Officer, `404` report not found, `409` the report was already processed by another officer, is not Rejected (reopen) or is not Verified (warning draft).

### Hazard report endpoints (citizens and officers)

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/hazard-reports` | Submitting with a token links the report to that user. `reportedBy` is always taken from the token, never from the body. Anonymous reports are still accepted |
| GET | `/api/hazard-reports` | DMC Officer only. Citizens use `/mine` |
| GET | `/api/hazard-reports/:id` | Login required. Visible to the reporter and DMC Officers; anyone else gets `404` |
| GET | `/api/hazard-reports/mine` | The user's own reports with `status`, officer `remarks`, `rejectionReason` and `additionalInfo` |
| POST | `/api/hazard-reports/:id/additional-info` | `{ message, photoFileId? }`. Only the reporter can answer, and only while the report is `Needs More Information`. The report goes back to `Pending Verification`. `404` not your report, `409` not waiting for information |

### Design notes

- **The officer decides, the system records.** The original sequence diagram had the Verification Service decide by itself. Here the officer sends the decision and the service only stores it.
- **No double decisions.** The report is updated only while it is still in the expected status, so if two officers decide at once the second gets `409`.
- **Decision and record stay together.** The status change and the `Verification` record are two writes. MongoDB transactions need a replica set, which a local or free-tier setup may not have, so if saving the record fails the status change is undone and the officer gets an error to retry.
- **Needs More Information is no longer a dead end.** The citizen sees the officer's note in My Reports, replies, and the report returns to the queue.
- **The checklist is the officer's judgement.** The original storyboard showed ticks that looked like the system was checking the report. Here the officer records what they personally checked, and Verified can't be chosen without confirming the location (and the evidence, if any).
- **Every severity label has a source.** The officer confirms or changes the report's severity when deciding, and it is stored on the `Verification` record, so a HIGH or MEDIUM label can be traced to who set it.
- **Service layer.** `src/services/verificationService.js` holds the verification logic and the controller only handles HTTP, matching the Verification Service lifeline in the sequence diagram.

### Tests

`npx jest tests/verification.test.js` runs the Component 2 tests against an in-memory MongoDB (mongodb-memory-server). The first run downloads a MongoDB binary, so it takes a few minutes.

### Examples

```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"officer@dmc.lk","password":"password123"}'

# Pending High-severity-first list for Kandy
curl "http://localhost:5000/api/reports?district=Kandy&sort=severity" \
  -H "Authorization: Bearer <token>"

# Report details
curl http://localhost:5000/api/reports/<reportObjectId> \
  -H "Authorization: Bearer <token>"

# Verify a report
curl -X POST http://localhost:5000/api/reports/<reportObjectId>/verification \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"decision":"Verified","checklist":{"locationChecked":true,"evidenceReviewed":true},"severity":"High"}'
```
