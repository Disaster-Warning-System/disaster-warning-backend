const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { app } = require("../src/server");
const User = require("../src/models/User");
const HazardReport = require("../src/models/HazardReport");
const Verification = require("../src/models/Verification");

let mongoServer;
let officer;
let citizen;
let otherCitizen;

const tokenFor = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
const auth = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

const createReport = (overrides = {}) =>
  HazardReport.create({
    hazardType: "Flood",
    description: "Water rising near the bridge",
    severity: "Medium",
    location: { latitude: 6.9336, longitude: 79.9856, address: "Kaduwela", district: "Colombo" },
    reportedBy: citizen._id.toString(),
    ...overrides,
  });

// Mongoose always refreshes updatedAt, so move it back with a raw update
const ageReport = (report, minutes) =>
  HazardReport.collection.updateOne(
    { _id: report._id },
    { $set: { updatedAt: new Date(Date.now() - minutes * 60 * 1000) } }
  );

// The first run downloads a MongoDB binary, which can take a while
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  // The driver loads "os" with a dynamic import, which Jest's CommonJS sandbox can't run.
  // Without it the handshake has no client metadata and the server refuses the connection.
  await mongoose.connect(mongoServer.getUri(), { runtimeAdapters: { os: require("os") } });
}, 300000);

beforeEach(async () => {
  [officer, citizen, otherCitizen] = await User.create([
    { name: "Officer", email: "officer@test.lk", password: "password123", role: "DMC Officer" },
    { name: "Citizen", email: "citizen@test.lk", password: "password123", role: "Citizen" },
    { name: "Other", email: "other@test.lk", password: "password123", role: "Citizen" },
  ]);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("security", () => {
  test("public registration cannot create an officer account", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "Fake", email: "fake@test.lk", password: "password123", role: "DMC Officer",
    });
    expect(response.status).toBe(403);
    expect(await User.exists({ email: "fake@test.lk" })).toBeNull();
  });

  test("public registration creates a citizen by default", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "New", email: "new@test.lk", password: "password123",
    });
    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe("Citizen");
  });

  test("verification endpoints need a DMC Officer", async () => {
    expect((await request(app).get("/api/reports")).status).toBe(401);
    expect((await request(app).get("/api/reports").set(auth(citizen))).status).toBe(403);
  });

  test("reportedBy comes from the token, not the request body", async () => {
    const response = await request(app)
      .post("/api/hazard-reports")
      .set(auth(citizen))
      .send({
        hazardType: "Flood",
        description: "Road flooded",
        location: { address: "Main street", district: "Colombo" },
        reportedBy: otherCitizen._id.toString(),
      });
    expect(response.status).toBe(201);
    expect(response.body.data.reportedBy).toBe(citizen._id.toString());
  });

  test("anonymous reports are still accepted without a reporter", async () => {
    const response = await request(app)
      .post("/api/hazard-reports")
      .send({ hazardType: "Fire", description: "Smoke", location: { address: "Galle" } });
    expect(response.status).toBe(201);
    expect(response.body.data.reportedBy).toBeNull();
  });
});

describe("GET /api/reports", () => {
  test("rejects an unknown status, hazard type, sort or page size", async () => {
    for (const query of ["status=Done", "hazardType=Volcano", "sort=oldest", "limit=500", "page=0"]) {
      const response = await request(app).get(`/api/reports?${query}`).set(auth(officer));
      expect(response.status).toBe(400);
    }
  });

  test("filters by status and pages the results", async () => {
    for (let i = 0; i < 5; i += 1) await createReport();
    await createReport({ status: "Verified" });

    const response = await request(app)
      .get("/api/reports?limit=2&page=3")
      .set(auth(officer));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 5, page: 3, pages: 3, count: 1 });
  });

  test("sorts by severity with High first", async () => {
    await createReport({ severity: "Low" });
    await createReport({ severity: "High" });
    await createReport({ severity: "Medium" });

    const response = await request(app).get("/api/reports?sort=severity").set(auth(officer));

    expect(response.body.data.map((report) => report.severity)).toEqual(["High", "Medium", "Low"]);
  });

  test("flags reports waiting longer than the SLA as overdue", async () => {
    const fresh = await createReport();
    const old = await createReport();
    await ageReport(old, 45);

    const response = await request(app).get("/api/reports").set(auth(officer));
    const byId = Object.fromEntries(response.body.data.map((report) => [report._id, report]));

    expect(byId[fresh._id].overdue).toBe(false);
    expect(byId[old._id].overdue).toBe(true);
  });
});

describe("GET /api/reports/:id", () => {
  test("includes nearby reports, reporter history and the photo url", async () => {
    const photoFileId = new mongoose.Types.ObjectId();
    const report = await createReport({ photoFileId });
    const nearby = await createReport({ location: { latitude: 6.94, longitude: 79.99, district: "Colombo" } });
    await createReport({ location: { latitude: 7.29, longitude: 80.63, district: "Kandy" } });
    await createReport({ hazardType: "Fire" });
    await createReport({ status: "Rejected", reportedBy: citizen._id.toString() });

    const response = await request(app).get(`/api/reports/${report._id}`).set(auth(officer));

    expect(response.status).toBe(200);
    expect(response.body.data.photoUrl).toBe(`/api/uploads/hazard-photo/${photoFileId}`);
    expect(response.body.data.nearbyReports.map((item) => item._id)).toContain(nearby._id.toString());
    expect(response.body.data.nearbyReports).toHaveLength(2);
    expect(response.body.data.reporterHistory).toEqual({ total: 4, verified: 0, rejected: 1 });
    expect(response.body.data.reportedBy.name).toBe("Citizen");
  });
});

describe("POST /api/reports/:id/verification", () => {
  test("requires remarks when rejecting", async () => {
    const report = await createReport();
    const response = await request(app)
      .post(`/api/reports/${report._id}/verification`)
      .set(auth(officer))
      .send({ decision: "Rejected" });
    expect(response.status).toBe(400);
  });

  test("records who verified the report", async () => {
    const report = await createReport();
    const response = await request(app)
      .post(`/api/reports/${report._id}/verification`)
      .set(auth(officer))
      .send({ decision: "Verified", checklist: { locationChecked: true } });

    expect(response.status).toBe(200);
    expect(response.body.data.report.status).toBe("Verified");
    const record = await Verification.findOne({ report: report._id });
    expect(record.officer.toString()).toBe(officer._id.toString());
  });

  test("only one of two simultaneous decisions succeeds", async () => {
    const report = await createReport();
    const decide = (decision, remarks) =>
      request(app)
        .post(`/api/reports/${report._id}/verification`)
        .set(auth(officer))
        .send({ decision, remarks });

    const responses = await Promise.all([decide("Verified"), decide("Rejected", "Duplicate")]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await Verification.countDocuments({ report: report._id })).toBe(1);
  });

  test("undoes the status change when the verification record cannot be saved", async () => {
    const report = await createReport();
    jest.spyOn(Verification, "create").mockRejectedValueOnce(new Error("write failed"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(app)
      .post(`/api/reports/${report._id}/verification`)
      .set(auth(officer))
      .send({ decision: "Rejected", remarks: "Not a hazard" });

    expect(response.status).toBe(500);
    const reloaded = await HazardReport.findById(report._id);
    expect(reloaded.status).toBe("Pending Verification");
    expect(reloaded.rejectionReason).toBe("");
  });
});

describe("Needs More Information loop", () => {
  test("the reporter sees the request and replies, sending it back to the queue", async () => {
    const report = await createReport();
    await request(app)
      .post(`/api/reports/${report._id}/verification`)
      .set(auth(officer))
      .send({ decision: "Needs More Information", remarks: "Send a photo of the bridge" });

    const mine = await request(app).get("/api/hazard-reports/mine").set(auth(citizen));
    expect(mine.status).toBe(200);
    expect(mine.body.data[0]).toMatchObject({
      status: "Needs More Information",
      remarks: "Send a photo of the bridge",
    });

    const strangerReply = await request(app)
      .post(`/api/hazard-reports/${report._id}/additional-info`)
      .set(auth(otherCitizen))
      .send({ message: "Not my report" });
    expect(strangerReply.status).toBe(404);

    const reply = await request(app)
      .post(`/api/hazard-reports/${report._id}/additional-info`)
      .set(auth(citizen))
      .send({ message: "The water is 1 m above the road near the bridge" });
    expect(reply.status).toBe(200);
    expect(reply.body.data.status).toBe("Pending Verification");
    expect(reply.body.data.additionalInfo).toHaveLength(1);

    const secondReply = await request(app)
      .post(`/api/hazard-reports/${report._id}/additional-info`)
      .set(auth(citizen))
      .send({ message: "Again" });
    expect(secondReply.status).toBe(409);
  });

  test("a reply needs a message", async () => {
    const report = await createReport({ status: "Needs More Information" });
    const response = await request(app)
      .post(`/api/hazard-reports/${report._id}/additional-info`)
      .set(auth(citizen))
      .send({ message: "   " });
    expect(response.status).toBe(400);
  });

  test("My Reports only lists the caller's own reports", async () => {
    await createReport();
    await createReport({ reportedBy: otherCitizen._id.toString() });

    const response = await request(app).get("/api/hazard-reports/mine").set(auth(citizen));

    expect(response.body.count).toBe(1);
  });
});

describe("POST /api/reports/:id/reopen", () => {
  test("sends a rejected report back to the queue and records it", async () => {
    const report = await createReport({ status: "Rejected", rejectionReason: "Wrong" });

    const response = await request(app)
      .post(`/api/reports/${report._id}/reopen`)
      .set(auth(officer))
      .send({ remarks: "Rejected by mistake" });

    expect(response.status).toBe(200);
    expect(response.body.data.report).toMatchObject({ status: "Pending Verification", rejectionReason: "" });
    expect(response.body.data.verification.decision).toBe("Reopened");
  });

  test("only rejected reports can be reopened", async () => {
    const report = await createReport();
    const response = await request(app)
      .post(`/api/reports/${report._id}/reopen`)
      .set(auth(officer))
      .send({ remarks: "Reopen" });
    expect(response.status).toBe(409);
  });

  test("the verification endpoint does not accept Reopened as a decision", async () => {
    const report = await createReport();
    const response = await request(app)
      .post(`/api/reports/${report._id}/verification`)
      .set(auth(officer))
      .send({ decision: "Reopened", remarks: "x" });
    expect(response.status).toBe(400);
  });
});

describe("GET /api/reports/:id/warning-draft", () => {
  test("pre-fills a warning from a verified report", async () => {
    const report = await createReport({ status: "Verified", severity: "High" });

    const response = await request(app)
      .get(`/api/reports/${report._id}/warning-draft`)
      .set(auth(officer));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      headline: "Flood reported in Colombo",
      severity: "Warning",
      targetAreas: ["Colombo"],
      channels: ["SMS", "Push"],
    });
    expect(response.body.data.sourceReport.reportId).toBe(report.reportId);
  });

  test("refuses reports that are not verified", async () => {
    const report = await createReport();
    const response = await request(app)
      .get(`/api/reports/${report._id}/warning-draft`)
      .set(auth(officer));
    expect(response.status).toBe(409);
  });
});

describe("GET /api/officer/dashboard", () => {
  test("returns counts per status and the overdue count", async () => {
    const old = await createReport();
    await ageReport(old, 45);
    await createReport();
    await createReport({ status: "Verified" });

    const response = await request(app).get("/api/officer/dashboard").set(auth(officer));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      pendingCount: 2,
      overdueCount: 1,
      statusCounts: { "Pending Verification": 2, Verified: 1, Rejected: 0 },
    });
  });
});
