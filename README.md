# Disaster Warning Backend

Hazard-report photos are stored as actual files in MongoDB GridFS using the existing Mongoose connection. They are never embedded in `HazardReport` documents or submitted as Base64.

## Photo API

- `POST /api/uploads/hazard-photo` accepts one multipart file in the `file` field.
- `GET /api/uploads/hazard-photo/:fileId` streams a stored image.
- `DELETE /api/uploads/hazard-photo/:fileId` removes an uploaded file when report creation fails.

Only JPEG, PNG, and WebP images with matching file signatures are accepted. The maximum size is 5 MB. `POST /api/hazard-reports` accepts an optional `photoFileId`, verifies that the GridFS file exists, and keeps status controlled by the backend with a default of `Pending Verification`.

Configure `MONGO_URI` and other server settings through the existing environment configuration. Do not commit credentials.

If the Node.js runtime cannot resolve an Atlas `mongodb+srv` URI through the system DNS resolver, set `MONGO_DNS_SERVERS=1.1.1.1,1.0.0.1` in the local `.env` file. This optional setting changes DNS resolvers process-wide for this backend process; omit it when the default resolver works.
## Verify Hazard Report (Component 2)

DMC Duty Officers review pending hazard reports and mark them as Verified, Rejected or Needs More Information. Only the officer makes this decision; the system never changes a report's status on its own.

### Running

1. Copy `.env.example` to `.env` and set `MONGO_URI`, `JWT_SECRET`, `PORT`, and `CORS_ORIGINS` as needed. `CORS_ORIGINS` is a comma-separated list of browser origins; the defaults allow the admin app and Expo web development ports.
2. `npm install`
3. `npm run seed` adds 2 DMC officers, 2 citizens and 12 sample reports. It only replaces its own seed data, so other data in the database is kept.
4. `npm run dev` (or `npm start`)

Seed logins (password `password123`): `officer@dmc.lk`, `officer2@dmc.lk`, `citizen1@example.lk`, `citizen2@example.lk`.

### Auth

| Method | Endpoint | Body |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ name, email, password, role?, district? }` |
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }` |

Roles: `Citizen` (default), `Volunteer`, `DMC Officer`, `District Officer`. Send the token as `Authorization: Bearer <token>`.

### Endpoints (DMC Officer only)

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/officer/dashboard` | `{ pendingCount, recentActivity }` (last 5 decisions) |
| GET | `/api/reports` | Report list. Query: `status` (default `Pending Verification`), `hazardType`, `district`, `search` (report ID or description), `sort` (`newest` or `severity`) |
| GET | `/api/reports/:id` | Full report, reporter name and verification history |
| POST | `/api/reports/:id/verification` | `{ decision, remarks }`. Decision is `Verified`, `Rejected` or `Needs More Information`. Remarks are required unless Verified |

Error codes: `400` invalid id, decision or missing remarks, `401` no or invalid token, `403` not a DMC Officer, `404` report not found, `409` the report was already processed by another officer.

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
  -d '{"decision":"Rejected","remarks":"Duplicate of HR-00010"}'
```
