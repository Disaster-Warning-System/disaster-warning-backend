require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Shelter = require("../models/Shelter");

const demoRemarks =
  "DEMO DATA ONLY. This public landmark is a map-location sample, not a designated or operating emergency shelter. Capacity and occupancy are fictional. Do not rely on this record in an emergency.";

// Public landmarks provide recognizable Sri Lankan map locations for UI demos.
// They are explicitly marked as demo-only and closed to avoid implying availability.
const demoShelters = [
  {
    name: "DEMO ONLY - Colombo Municipal Council Town Hall",
    location: "Town Hall, Colombo, Sri Lanka",
    locationPoint: {
      type: "Point",
      coordinates: [79.863764, 6.915811],
    },
    capacity: 120,
    occupancy: 120,
    operationalStatus: "Closed",
    remarks: demoRemarks,
  },
  {
    name: "DEMO ONLY - D. S. Senanayake Memorial Public Library",
    location: "Ahalepola Kumarihami Mawatha, Kandy, Sri Lanka",
    locationPoint: {
      type: "Point",
      coordinates: [80.635485, 7.291829],
    },
    capacity: 80,
    occupancy: 80,
    operationalStatus: "Closed",
    remarks: demoRemarks,
  },
  {
    name: "DEMO ONLY - Jaffna Public Library",
    location: "Jaffna-Kankesanturai Road, Jaffna, Sri Lanka",
    locationPoint: {
      type: "Point",
      coordinates: [80.01181, 9.66217],
    },
    capacity: 100,
    occupancy: 100,
    operationalStatus: "Closed",
    remarks: demoRemarks,
  },
  {
    name: "DEMO ONLY - Galle International Cricket Stadium",
    location: "Galle Fort, Galle, Sri Lanka",
    locationPoint: {
      type: "Point",
      coordinates: [80.21603, 6.03155],
    },
    capacity: 150,
    occupancy: 150,
    operationalStatus: "Closed",
    remarks: demoRemarks,
  },
];

const seedDemoShelters = async () => {
  let inserted = 0;
  let skipped = 0;

  try {
    await connectDB();

    for (const shelter of demoShelters) {
      const existing = await Shelter.exists({ name: shelter.name });
      if (existing) {
        skipped += 1;
        continue;
      }

      await Shelter.create(shelter);
      inserted += 1;
    }

    console.log(
      `Demo shelter seeding complete. Inserted: ${inserted}; already present: ${skipped}.`,
    );
  } catch (error) {
    console.error("Demo shelter seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

void seedDemoShelters();
