jest.mock("../src/models/HazardReport", () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock("../src/services/gridfsService", () => ({
  findFile: jest.fn(),
}));

const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const HazardReport = require("../src/models/HazardReport");
const { findFile } = require("../src/services/gridfsService");
const hazardReportRoutes = require("../src/routes/hazardReportRoutes");

const app = express();
app.use(express.json());
app.use("/api/hazard-reports", hazardReportRoutes);

process.env.JWT_SECRET = "hazard-report-tests-only-secret";
const citizenToken = jwt.sign(
  { id: "citizen-1", role: "Citizen" },
  process.env.JWT_SECRET,
);

const payload = {
  hazardType: "Flood",
  description: "Water is entering homes near the river.",
  severity: "High",
  location: {
    latitude: 6.9271,
    longitude: 79.8612,
    address: "Colombo 07",
    district: "Colombo",
  },
  evidence: [{ url: "https://example.com/flood.jpg", type: "image" }],
};

function authenticatedRequest(method, path) {
  return request(app)[method](path).set(
    "Authorization",
    `Bearer ${citizenToken}`,
  );
}

function createdReport(overrides = {}) {
  return {
    _id: "66b2a945df0fc2e72ea73123",
    reportId: "HR-20261009-000001",
    ...payload,
    photoFileId: null,
    reportedBy: "citizen-1",
    status: "Pending Verification",
    remarks: "",
    rejectionReason: "",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  HazardReport.findOne.mockResolvedValue(null);
  HazardReport.create.mockResolvedValue(createdReport());
  findFile.mockResolvedValue(true);
});

test("requires authentication before accepting a hazard report", async () => {
  const response = await request(app)
    .post("/api/hazard-reports")
    .send(payload);

  expect(response.status).toBe(401);
  expect(response.body.message).toMatch(/token missing/i);
  expect(HazardReport.create).not.toHaveBeenCalled();
});

test("submits a valid report as pending verification for the logged-in citizen", async () => {
  const response = await authenticatedRequest("post", "/api/hazard-reports")
    .set("Idempotency-Key", "submission-1")
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.success).toBe(true);
  expect(response.body.report.status).toBe("Pending Verification");
  expect(HazardReport.create).toHaveBeenCalledWith(
    expect.objectContaining({
      hazardType: "Flood",
      description: payload.description,
      severity: "High",
      reportedBy: "citizen-1",
      status: "Pending Verification",
      idempotencyKey: "submission-1",
    }),
  );
});

test("accepts a report with a manual address when GPS coordinates are unavailable", async () => {
  const response = await authenticatedRequest("post", "/api/hazard-reports")
    .send({
      ...payload,
      severity: undefined,
      evidence: undefined,
      location: {
        address: "Kandy railway station",
        district: "Kandy",
      },
    });

  expect(response.status).toBe(201);
  expect(HazardReport.create).toHaveBeenCalledWith(
    expect.objectContaining({
      severity: "Medium",
      evidence: [],
      location: {
        latitude: null,
        longitude: null,
        address: "Kandy railway station",
        district: "Kandy",
      },
    }),
  );
});

test("trims the description and location text before saving", async () => {
  const response = await authenticatedRequest("post", "/api/hazard-reports")
    .send({
      ...payload,
      description: "  Road blocked by fallen tree.  ",
      location: {
        ...payload.location,
        address: "  Gampaha town  ",
        district: "  Gampaha  ",
      },
    });

  expect(response.status).toBe(201);
  expect(HazardReport.create).toHaveBeenCalledWith(
    expect.objectContaining({
      description: "Road blocked by fallen tree.",
      location: expect.objectContaining({
        address: "Gampaha town",
        district: "Gampaha",
      }),
    }),
  );
});

test.each([
  [{ ...payload, hazardType: "Tsunami" }],
  [{ ...payload, description: "   " }],
  [{ ...payload, severity: "Critical" }],
  [{ ...payload, location: {} }],
  [{ ...payload, evidence: [{ url: "" }] }],
])("rejects an invalid report payload: %j", async (invalidPayload) => {
  const response = await authenticatedRequest("post", "/api/hazard-reports")
    .send(invalidPayload);

  expect(response.status).toBe(400);
  expect(response.body.message).toBe("Validation failed");
  expect(response.body.errors.length).toBeGreaterThan(0);
  expect(HazardReport.create).not.toHaveBeenCalled();
});

test("does not allow the request body to impersonate another reporter", async () => {
  const response = await authenticatedRequest("post", "/api/hazard-reports")
    .send({ ...payload, reportedBy: "another-citizen" });

  expect(response.status).toBe(201);
  expect(HazardReport.create).toHaveBeenCalledWith(
    expect.objectContaining({ reportedBy: "citizen-1" }),
  );
  expect(HazardReport.create).not.toHaveBeenCalledWith(
    expect.objectContaining({ reportedBy: "another-citizen" }),
  );
});

test("returns the existing report for a repeated idempotency key", async () => {
  const existingReport = createdReport({ reportId: "HR-existing" });
  HazardReport.findOne.mockResolvedValue(existingReport);

  const response = await authenticatedRequest("post", "/api/hazard-reports")
    .set("Idempotency-Key", "submission-1")
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.report.reportId).toBe("HR-existing");
  expect(HazardReport.create).not.toHaveBeenCalled();
});

test("validates that an attached photo exists before creating the report", async () => {
  findFile.mockResolvedValue(false);

  const response = await authenticatedRequest("post", "/api/hazard-reports")
    .send({
      ...payload,
      photoFileId: "66b2a945df0fc2e72ea73123",
    });

  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/photo does not exist/i);
  expect(HazardReport.create).not.toHaveBeenCalled();
});

test("accepts a report when the attached photo exists", async () => {
  const photoFileId = "66b2a945df0fc2e72ea73123";

  const response = await authenticatedRequest("post", "/api/hazard-reports")
    .send({ ...payload, photoFileId });

  expect(response.status).toBe(201);
  expect(findFile).toHaveBeenCalledWith(photoFileId);
  expect(HazardReport.create).toHaveBeenCalledWith(
    expect.objectContaining({ photoFileId }),
  );
});

test("returns a server error when report persistence fails", async () => {
  HazardReport.create.mockRejectedValueOnce(new Error("Database unavailable"));

  const response = await authenticatedRequest("post", "/api/hazard-reports")
    .send(payload);

  expect(response.status).toBe(500);
  expect(response.body.message).toBe("An unexpected error occurred");
});

test("returns the logged-in citizen's reports sorted by newest first", async () => {
  const reports = [createdReport()];
  const sort = jest.fn().mockResolvedValue(reports);
  HazardReport.find.mockReturnValue({ sort });

  const response = await authenticatedRequest("get", "/api/hazard-reports");

  expect(response.status).toBe(200);
  expect(response.body.data).toEqual(reports);
  expect(HazardReport.find).toHaveBeenCalledWith({ reportedBy: "citizen-1" });
  expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
});

test("returns one of the logged-in citizen's reports by ID", async () => {
  const report = createdReport();
  HazardReport.findOne.mockResolvedValue(report);

  const response = await authenticatedRequest(
    "get",
    `/api/hazard-reports/${report._id}`,
  );

  expect(response.status).toBe(200);
  expect(response.body.data).toEqual(report);
  expect(HazardReport.findOne).toHaveBeenCalledWith({
    _id: report._id,
    reportedBy: "citizen-1",
  });
});

test("does not expose a report belonging to another citizen", async () => {
  HazardReport.findOne.mockResolvedValue(null);

  const response = await authenticatedRequest(
    "get",
    "/api/hazard-reports/66b2a945df0fc2e72ea73123",
  );

  expect(response.status).toBe(404);
  expect(response.body.message).toBe("Hazard report not found");
});

test("rejects an invalid report ID without querying the database", async () => {
  const response = await authenticatedRequest(
    "get",
    "/api/hazard-reports/not-an-object-id",
  );

  expect(response.status).toBe(404);
  expect(response.body.message).toBe("Hazard report not found");
  expect(HazardReport.findOne).not.toHaveBeenCalled();
});

test("returns the stored report when a duplicate idempotency key races the first request", async () => {
  const existingReport = createdReport({ reportId: "HR-race-winner" });
  const duplicateError = new Error("Duplicate idempotency key");
  duplicateError.code = 11000;
  HazardReport.create.mockRejectedValueOnce(duplicateError);
  HazardReport.findOne
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(existingReport);

  const response = await authenticatedRequest("post", "/api/hazard-reports")
    .set("Idempotency-Key", "submission-race")
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.report.reportId).toBe("HR-race-winner");
  expect(HazardReport.findOne).toHaveBeenCalledTimes(2);
});
