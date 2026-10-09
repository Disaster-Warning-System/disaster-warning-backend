jest.mock("../src/controllers/shelterImageController", () => ({
  uploadShelterImage: (_req, res) => res.status(201).json({ success: true }),
  getShelterImage: (_req, res) => res.status(200).json({ success: true }),
  deleteShelterImage: (_req, res) => res.status(200).json({ success: true }),
}));

const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const shelterImageRoutes = require("../src/routes/shelterImageRoutes");

process.env.JWT_SECRET = "shelter-image-tests-only-secret";
const officerToken = jwt.sign({ id: "officer-1", role: "District Officer" }, process.env.JWT_SECRET);
const citizenToken = jwt.sign({ id: "citizen-1", role: "Citizen" }, process.env.JWT_SECRET);
const app = express();
app.use("/api/shelters/images", shelterImageRoutes);

test("allows citizens to read shelter images", async () => {
  const response = await request(app).get("/api/shelters/images/image-id");

  expect(response.status).toBe(200);
});

test("requires a District Officer token to upload or delete shelter images", async () => {
  const anonymousUpload = await request(app).post("/api/shelters/images");
  const citizenDelete = await request(app)
    .delete("/api/shelters/images/image-id")
    .set("Authorization", `Bearer ${citizenToken}`);
  const officerUpload = await request(app)
    .post("/api/shelters/images")
    .set("Authorization", `Bearer ${officerToken}`);
  const officerDelete = await request(app)
    .delete("/api/shelters/images/image-id")
    .set("Authorization", `Bearer ${officerToken}`);

  expect(anonymousUpload.status).toBe(401);
  expect(citizenDelete.status).toBe(403);
  expect(officerUpload.status).toBe(201);
  expect(officerDelete.status).toBe(200);
});
