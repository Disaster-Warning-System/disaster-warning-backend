jest.mock("../src/models/Shelter", () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

jest.mock("../src/services/shelterImageStorageService", () => ({
  deleteImage: jest.fn(),
}));

const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const Shelter = require("../src/models/Shelter");
const shelterRoutes = require("../src/routes/shelterRoutes");

const app = express();
app.use(express.json());
app.use("/api/shelters", shelterRoutes);
process.env.JWT_SECRET = "shelter-tests-only-secret";
const officerToken = jwt.sign({ id: "officer-1", role: "District Officer" }, process.env.JWT_SECRET);
const citizenToken = jwt.sign({ id: "citizen-1", role: "Citizen" }, process.env.JWT_SECRET);

function officerRequest(method, path) {
  return request(app)[method](path).set("Authorization", `Bearer ${officerToken}`);
}

const payload = {
  name: "Central Community Hall",
  location: "Colombo 07",
  locationPoint: { type: "Point", coordinates: [79.8612, 6.9271] },
  capacity: 120,
  occupancy: 35,
  operationalStatus: "Open",
  remarks: "",
};

function mockShelter(overrides = {}) {
  return {
    _id: "66b2a945df0fc2e72ea73123",
    ...payload,
    availableSpaces: 85,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("creates a shelter after validating required details", async () => {
  Shelter.create.mockResolvedValue(mockShelter());

  const response = await officerRequest("post", "/api/shelters").send(payload);

  expect(response.status).toBe(201);
  expect(response.body.success).toBe(true);
  expect(response.body.data.name).toBe(payload.name);
  expect(Shelter.create).toHaveBeenCalledWith(
    expect.objectContaining({
      occupancy: 35,
      capacity: 120,
      occupancyHistory: [
        expect.objectContaining({
          occupancy: 35,
          operationalStatus: "Open",
          changedAt: expect.any(Date),
        }),
      ],
    }),
  );
});

test("returns actionable validation errors without creating invalid shelter data", async () => {
  const response = await officerRequest("post", "/api/shelters")
    .send({ ...payload, occupancy: 121 });

  expect(response.status).toBe(400);
  expect(response.body.errors).toContain(
    "Current occupancy cannot exceed capacity. Enter a lower occupancy.",
  );
  expect(Shelter.create).not.toHaveBeenCalled();
});

test("requires at least one field in an update request", async () => {
  const response = await officerRequest("patch", "/api/shelters/66b2a945df0fc2e72ea73123")
    .send({});

  expect(response.status).toBe(400);
  expect(response.body.errors[0]).toMatch(/No shelter changes were provided/);
  expect(Shelter.findById).not.toHaveBeenCalled();
});

test("returns the shelter list sorted by name", async () => {
  const shelters = [mockShelter()];
  Shelter.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(shelters) });

  const response = await request(app).get("/api/shelters");

  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(1);
  expect(Shelter.find).toHaveBeenCalledTimes(1);
});

test("returns an individual shelter by its valid id", async () => {
  Shelter.findById.mockResolvedValue(mockShelter());

  const response = await request(app).get("/api/shelters/66b2a945df0fc2e72ea73123");

  expect(response.status).toBe(200);
  expect(response.body.data.name).toBe(payload.name);
});

test("returns a safe server error when the shelter list query fails", async () => {
  Shelter.find.mockReturnValue({ sort: jest.fn().mockRejectedValue(new Error("database offline")) });

  const response = await request(app).get("/api/shelters");

  expect(response.status).toBe(500);
  expect(response.body.message).toBe("An unexpected error occurred");
});

test("updates occupancy and operational status for a district update", async () => {
  Shelter.findById.mockResolvedValue(mockShelter());
  Shelter.findByIdAndUpdate.mockResolvedValue(
    mockShelter({ occupancy: 80, operationalStatus: "Closed", availableSpaces: 40 }),
  );

  const response = await officerRequest("patch", "/api/shelters/66b2a945df0fc2e72ea73123")
    .send({ occupancy: 80, operationalStatus: "Closed" });

  expect(response.status).toBe(200);
  expect(response.body.data.occupancy).toBe(80);
  expect(Shelter.findByIdAndUpdate).toHaveBeenCalledWith(
    "66b2a945df0fc2e72ea73123",
    expect.objectContaining({
      $set: { occupancy: 80, operationalStatus: "Closed" },
      $push: {
        occupancyHistory: {
          $each: [
            expect.objectContaining({
              occupancy: 80,
              operationalStatus: "Closed",
              changedAt: expect.any(Date),
            }),
          ],
          $slice: -100,
        },
      },
    }),
    { new: true, runValidators: true },
  );
});

test("does not add occupancy history for an unrelated shelter edit", async () => {
  Shelter.findById.mockResolvedValue(mockShelter());
  Shelter.findByIdAndUpdate.mockResolvedValue(mockShelter({ remarks: "Checked" }));

  const response = await officerRequest("patch", "/api/shelters/66b2a945df0fc2e72ea73123")
    .send({ remarks: "Checked" });

  expect(response.status).toBe(200);
  expect(Shelter.findByIdAndUpdate.mock.calls[0][1]).toEqual({
    $set: { remarks: "Checked" },
  });
});

test("returns occupancy and status history for a shelter", async () => {
  const history = [
    { occupancy: 35, operationalStatus: "Open", changedAt: new Date("2026-10-01T00:00:00Z") },
    { occupancy: 80, operationalStatus: "Closed", changedAt: new Date("2026-10-02T00:00:00Z") },
  ];
  Shelter.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue(mockShelter({ occupancyHistory: history })),
  });

  const response = await officerRequest("get",
    "/api/shelters/66b2a945df0fc2e72ea73123/history",
  );

  expect(response.status).toBe(200);
  expect(response.body.data.entries).toHaveLength(2);
  expect(response.body.data.entries[1].occupancy).toBe(80);
  expect(response.body.data.shelter).toEqual({
    id: "66b2a945df0fc2e72ea73123",
    name: payload.name,
    capacity: payload.capacity,
  });
  expect(Shelter.findById.mock.results[0].value.select).toHaveBeenCalledWith(
    "+occupancyHistory",
  );
});

test("returns not found when requesting history for an unknown shelter", async () => {
  Shelter.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

  const response = await officerRequest("get",
    "/api/shelters/66b2a945df0fc2e72ea73123/history",
  );

  expect(response.status).toBe(404);
  expect(response.body.message).toBe("Shelter not found");
});

test("prevents updates that would exceed the current shelter capacity", async () => {
  Shelter.findById.mockResolvedValue(mockShelter());

  const response = await officerRequest("patch", "/api/shelters/66b2a945df0fc2e72ea73123")
    .send({ occupancy: 121 });

  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/cannot exceed capacity/);
  expect(Shelter.findByIdAndUpdate).not.toHaveBeenCalled();
});

test("returns not found when an update targets an unknown shelter", async () => {
  Shelter.findById.mockResolvedValue(null);

  const response = await officerRequest("patch", "/api/shelters/66b2a945df0fc2e72ea73123")
    .send({ operationalStatus: "Closed" });

  expect(response.status).toBe(404);
  expect(response.body.message).toBe("Shelter not found");
});

test("returns not found for an unknown shelter", async () => {
  Shelter.findById.mockResolvedValue(null);

  const response = await request(app).get("/api/shelters/66b2a945df0fc2e72ea73123");

  expect(response.status).toBe(404);
  expect(response.body.message).toBe("Shelter not found");
});

test("deletes a shelter", async () => {
  Shelter.findByIdAndDelete.mockResolvedValue(mockShelter());

  const response = await officerRequest("delete", "/api/shelters/66b2a945df0fc2e72ea73123");

  expect(response.status).toBe(200);
  expect(response.body.message).toBe("Shelter deleted successfully");
});

test("returns not found when deleting an unknown shelter", async () => {
  Shelter.findByIdAndDelete.mockResolvedValue(null);

  const response = await officerRequest("delete", "/api/shelters/66b2a945df0fc2e72ea73123");

  expect(response.status).toBe(404);
  expect(response.body.message).toBe("Shelter not found");
});

test("maps model validation failures to actionable field errors", async () => {
  const validationError = new Error("validation failed");
  validationError.name = "ValidationError";
  validationError.errors = {
    capacity: { path: "capacity", name: "ValidatorError" },
  };
  Shelter.create.mockRejectedValue(validationError);

  const response = await officerRequest("post", "/api/shelters").send(payload);

  expect(response.status).toBe(400);
  expect(response.body.errors).toContain(
    "Capacity must be a whole number greater than 0. Enter a valid capacity.",
  );
});

test.each([
  ["capacity", /Capacity must be a whole number/],
  ["occupancy", /Current occupancy must be a whole number/],
  ["locationPoint.coordinates", /Map location is invalid/],
  ["customField", /customField value is invalid/],
])("maps Mongoose cast errors for %s to useful messages", async (path, expectedMessage) => {
  const castError = new Error("cast failed");
  castError.name = "CastError";
  castError.path = path;
  Shelter.create.mockRejectedValue(castError);

  const response = await officerRequest("post", "/api/shelters").send(payload);

  expect(response.status).toBe(400);
  expect(response.body.errors[0]).toMatch(expectedMessage);
});

test("rejects shelter changes without a token or a District Officer role", async () => {
  const anonymousResponse = await request(app).post("/api/shelters").send(payload);
  const citizenResponse = await request(app)
    .post("/api/shelters")
    .set("Authorization", `Bearer ${citizenToken}`)
    .send(payload);

  expect(anonymousResponse.status).toBe(401);
  expect(citizenResponse.status).toBe(403);
  expect(Shelter.create).not.toHaveBeenCalled();
});

test.each([
  ["patch", "/api/shelters/66b2a945df0fc2e72ea73123", { occupancy: 50 }],
  ["delete", "/api/shelters/66b2a945df0fc2e72ea73123", undefined],
  ["get", "/api/shelters/66b2a945df0fc2e72ea73123/history", undefined],
])("requires an officer role for protected %s shelter operations", async (method, path, body) => {
  const anonymousRequest = request(app)[method](path);
  if (body) anonymousRequest.send(body);
  const anonymousResponse = await anonymousRequest;
  const citizenRequest = request(app)[method](path)
    .set("Authorization", `Bearer ${citizenToken}`);
  if (body) citizenRequest.send(body);
  const citizenResponse = await citizenRequest;

  expect(anonymousResponse.status).toBe(401);
  expect(citizenResponse.status).toBe(403);
});

test("keeps shelter lists available to citizens", async () => {
  Shelter.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([mockShelter()]) });

  const response = await request(app).get("/api/shelters");

  expect(response.status).toBe(200);
});
