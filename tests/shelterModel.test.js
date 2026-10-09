const Shelter = require("../src/models/Shelter");

function makeShelter(overrides = {}) {
  return new Shelter({
    name: "Community Hall",
    location: "Colombo",
    capacity: 100,
    occupancy: 40,
    operationalStatus: "Open",
    ...overrides,
  });
}

describe("shelter capacity model behavior", () => {
  test("marks an exactly full shelter as Full with no available spaces", () => {
    const shelter = makeShelter({ occupancy: 100 });

    expect(shelter.availableSpaces).toBe(0);
    expect(shelter.availabilityStatus).toBe("Full");
  });

  test("calculates remaining spaces below capacity and retains operational status", () => {
    const shelter = makeShelter({ occupancy: 75, operationalStatus: "Closed" });

    expect(shelter.availableSpaces).toBe(25);
    expect(shelter.availabilityStatus).toBe("Closed");
  });

  test("rejects occupancy above the capacity", async () => {
    await expect(makeShelter({ occupancy: 101 }).validate()).rejects.toHaveProperty(
      "errors.occupancy",
    );
  });
});
