# Disaster Warning Backend

Hazard-report photos are stored as actual files in MongoDB GridFS using the existing Mongoose connection. They are never embedded in `HazardReport` documents or submitted as Base64.

## Photo API

- `POST /api/uploads/hazard-photo` accepts one multipart file in the `file` field.
- `GET /api/uploads/hazard-photo/:fileId` streams a stored image.
- `DELETE /api/uploads/hazard-photo/:fileId` removes an uploaded file when report creation fails.

Only JPEG, PNG, and WebP images with matching file signatures are accepted. The maximum size is 5 MB. `POST /api/hazard-reports` accepts an optional `photoFileId`, verifies that the GridFS file exists, and keeps status controlled by the backend with a default of `Pending Verification`.

Configure `MONGO_URI` and other server settings through the existing environment configuration. Do not commit credentials.

If the Node.js runtime cannot resolve an Atlas `mongodb+srv` URI through the system DNS resolver, set `MONGO_DNS_SERVERS=1.1.1.1,1.0.0.1` in the local `.env` file. This optional setting changes DNS resolvers process-wide for this backend process; omit it when the default resolver works.
