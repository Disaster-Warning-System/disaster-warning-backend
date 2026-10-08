// Seeds demo data for the Verify Hazard Report component.
// Only touches its own users (by email) and the reports created by the seed citizens,
// so other teammates' data is left alone.
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const User = require("../models/User");
const HazardReport = require("../models/HazardReport");
const Verification = require("../models/Verification");

const seedUsers = [
  { name: "Nimal Perera", email: "officer@dmc.lk", role: "DMC Officer", district: "Colombo" },
  { name: "Kamala Silva", email: "officer2@dmc.lk", role: "DMC Officer", district: "Colombo" },
  { name: "Saman Kumara", email: "citizen1@example.lk", role: "Citizen", district: "Gampaha" },
  { name: "Dilini Fernando", email: "citizen2@example.lk", role: "Citizen", district: "Kandy" },
];

const photo = (text) => ({
  url: `https://placehold.co/600x400?text=${encodeURIComponent(text)}`,
  type: "image",
});

// citizen: 0 or 1, decision: set for reports that were already reviewed
const seedReports = [
  {
    hazardType: "Flood", severity: "High", citizen: 0,
    description: "Kelani River overflowing near Kaduwela bridge, water entering houses.",
    location: { latitude: 6.9336, longitude: 79.9856, address: "Kaduwela bridge", district: "Colombo" },
    evidence: [photo("Kaduwela flood"), photo("Flooded road")],
  },
  {
    hazardType: "Flood", severity: "Medium", citizen: 1,
    description: "Low-lying roads in Wellampitiya under knee-deep water after heavy rain.",
    location: { latitude: 6.9394, longitude: 79.8907, address: "Wellampitiya", district: "Colombo" },
    evidence: [photo("Wellampitiya")],
  },
  {
    hazardType: "Flood", severity: "High", citizen: 0,
    description: "Attanagalu Oya rising quickly, families moving to the temple in Ja-Ela.",
    location: { latitude: 7.0744, longitude: 79.8919, address: "Ja-Ela town", district: "Gampaha" },
    evidence: [photo("Ja-Ela flood")],
  },
  {
    hazardType: "Other", severity: "Low", citizen: 1,
    description: "Large tree fallen across the Gampaha - Minuwangoda road, blocking one lane.",
    location: { latitude: 7.0917, longitude: 79.9999, address: "Gampaha - Minuwangoda Rd", district: "Gampaha" },
    evidence: [],
  },
  {
    hazardType: "Flood", severity: "Medium", citizen: 0,
    description: "Kalu Ganga water level high near Kalutara bridge, riverbank homes at risk.",
    location: { latitude: 6.5854, longitude: 79.9607, address: "Kalutara bridge", district: "Kalutara" },
    evidence: [photo("Kalu Ganga")],
  },
  {
    hazardType: "Landslide", severity: "High", citizen: 1,
    description: "Cracks appearing on the hillside above houses in Peradeniya after continuous rain.",
    location: { latitude: 7.2690, longitude: 80.5942, address: "Peradeniya", district: "Kandy" },
    evidence: [photo("Hill cracks"), photo("Soil movement")],
  },
  {
    hazardType: "Landslide", severity: "Medium", citizen: 1,
    description: "Small earth slip onto the Kandy - Mahiyangana road near Hunnasgiriya.",
    location: { latitude: 7.2906, longitude: 80.7710, address: "Hunnasgiriya", district: "Kandy" },
    evidence: [photo("Earth slip")],
  },
  {
    hazardType: "Cyclone", severity: "Medium", citizen: 0,
    description: "Very strong winds and rough sea at Galle Fort, fishing boats returning to harbour.",
    location: { latitude: 6.0269, longitude: 80.2170, address: "Galle Fort", district: "Galle" },
    evidence: [photo("Rough sea")],
  },
  {
    hazardType: "Flood", severity: "Low", citizen: 0,
    description: "Nilwala Ganga slightly above normal level near Matara town.",
    location: { latitude: 5.9549, longitude: 80.5550, address: "Matara town", district: "Matara" },
    evidence: [],
  },
  {
    hazardType: "Landslide", severity: "High", citizen: 1, decision: "Verified",
    remarks: "Confirmed with NBRO field officer. Area under landslide watch.",
    description: "Major landslide in Kuruwita, road completely blocked and two houses damaged.",
    location: { latitude: 6.7770, longitude: 80.3644, address: "Kuruwita", district: "Ratnapura" },
    evidence: [photo("Kuruwita landslide")],
  },
  {
    hazardType: "Flood", severity: "High", citizen: 0, decision: "Verified",
    remarks: "Confirmed by Ratnapura DS office. Kalu Ganga above flood level.",
    description: "Ratnapura town flooding, Kalu Ganga burst its banks near the main bus stand.",
    location: { latitude: 6.6828, longitude: 80.3992, address: "Ratnapura bus stand", district: "Ratnapura" },
    evidence: [photo("Ratnapura town"), photo("Bus stand")],
  },
  {
    hazardType: "Fire", severity: "Low", citizen: 1, decision: "Rejected",
    remarks: "Controlled garbage burning confirmed by local police, not a hazard.",
    description: "Smoke seen near Weligama beach area.",
    location: { latitude: 5.9741, longitude: 80.4296, address: "Weligama", district: "Matara" },
    evidence: [],
  },
];

const seed = async () => {
  await connectDB();

  const users = [];
  for (const data of seedUsers) {
    let user = await User.findOne({ email: data.email });
    if (!user) user = new User(data);
    Object.assign(user, data, { password: "password123" });
    await user.save();
    users.push(user);
  }
  const [officer, , ...citizens] = users;
  const citizenIds = citizens.map((citizen) => citizen._id.toString());

  const oldReports = await HazardReport.find({ reportedBy: { $in: citizenIds } }).select("_id");
  const oldReportIds = oldReports.map((report) => report._id);
  await Verification.deleteMany({ report: { $in: oldReportIds } });
  await HazardReport.deleteMany({ _id: { $in: oldReportIds } });

  for (const { citizen, decision, remarks, ...data } of seedReports) {
    // Created one by one so the auto-generated reportIds stay in order
    const report = await HazardReport.create({
      ...data,
      reportedBy: citizenIds[citizen],
      status: decision || "Pending Verification",
      remarks: remarks || "",
      rejectionReason: decision === "Rejected" ? remarks : "",
    });

    if (decision) {
      await Verification.create({ report: report._id, officer: officer._id, decision, remarks });
    }
  }

  console.log(`Seeded ${users.length} users and ${seedReports.length} hazard reports`);
  console.log("Login: officer@dmc.lk / password123 (second officer: officer2@dmc.lk)");
};

seed()
  .catch((error) => {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
