const {
  validateCreateShelter,
  validateUpdateShelter,
} = require("../src/validators/shelterValidator");

const validShelter = {
  name: "Central Community Hall",
  location: "Colombo 07",
  locationPoint: { type: "Point", coordinates: [79.8612, 6.9271] },
  capacity: 120,
  occupancy: 35,
  operationalStatus: "Open",
  remarks: "",
};

describe("shelter request validation", () => {
  test("accepts valid shelter registration data", () => {
    expect(validateCreateShelter(validShelter)).toEqual([]);
  });

  test("requires a map point and valid capacity for a new shelter", () => {
    const errors = validateCreateShelter({
      ...validShelter,
      locationPoint: undefined,
      capacity: 0,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Map location is required/),
        expect.stringMatching(/Capacity must be a whole number/),
      ]),
    );
  });

  test("rejects occupancy above capacity", () => {
    const errors = validateCreateShelter({ ...validShelter, occupancy: 121 });

    expect(errors).toContain(
      "Current occupancy cannot exceed capacity. Enter a lower occupancy.",
    );
  });

  test("rejects GeoJSON coordinates outside longitude and latitude bounds", () => {
    const errors = validateCreateShelter({
      ...validShelter,
      locationPoint: { type: "Point", coordinates: [181, 6.9] },
    });

    expect(errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/Map location is invalid/)]),
    );
  });

  test("allows only supported update fields and requires a change", () => {
    expect(validateUpdateShelter({})).toEqual([
      "No shelter changes were provided. Enter a location, occupancy, status, or remarks update.",
    ]);
    expect(validateUpdateShelter({ capacity: 50 })).toEqual([
      "capacity cannot be changed here. Update location, occupancy, operational status, or remarks instead.",
    ]);
  });

  test("accepts status-only and occupancy updates", () => {
    expect(validateUpdateShelter({ operationalStatus: "Closed" })).toEqual([]);
    expect(validateUpdateShelter({ occupancy: 80 })).toEqual([]);
  });

  test("rejects unsupported status, negative occupancy, and long remarks", () => {
    const errors = validateUpdateShelter({
      operationalStatus: "Full",
      occupancy: -1,
      remarks: "x".repeat(501),
    });

    expect(errors).toHaveLength(3);
    expect(errors.join(" ")).toMatch(/Operational status must be Open or Closed/);
    expect(errors.join(" ")).toMatch(/Current occupancy must be a whole number/);
    expect(errors.join(" ")).toMatch(/Remarks must be 500 characters or fewer/);
  });

  test("rejects non-object request bodies and invalid create fields", () => {
    expect(validateCreateShelter(null)).toEqual([
      "Shelter data must be an object. Submit the shelter fields as JSON.",
    ]);
    const errors = validateCreateShelter({
      ...validShelter,
      name: "n".repeat(121),
      location: "x".repeat(241),
      capacity: 1.5,
      occupancy: -1,
      operationalStatus: "Unknown",
      remarks: 5,
      imageId: "invalid",
    });
    expect(errors).toHaveLength(7);
  });

  test("rejects update locations, map points, remarks, and image references with invalid values", () => {
    const errors = validateUpdateShelter({
      location: " ",
      locationPoint: { type: "LineString", coordinates: [] },
      remarks: "x".repeat(501),
      imageId: "invalid",
    });
    expect(errors).toHaveLength(4);
  });
});
