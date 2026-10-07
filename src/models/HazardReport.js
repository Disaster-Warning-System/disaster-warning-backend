const mongoose = require("mongoose");
const Counter = require("./Counter");

const hazardTypes = [
  "Flood",
  "Landslide",
  "Cyclone",
  "Fire",
  "Earthquake",
  "Other",
];

const reportStatuses = [
  "Pending Verification",
  "Verified",
  "Rejected",
  "Needs More Information",
];

const severities = ["Low", "Medium", "High"];

const locationSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    address: {
      type: String,
      default: "",
    },
    district: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const evidenceSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      default: "image",
    },
  },
  { _id: false }
);

const hazardReportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      unique: true,
      sparse: true,
    },
    hazardType: {
      type: String,
      required: true,
      enum: hazardTypes,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      enum: severities,
      default: "Medium",
    },
    location: {
      type: locationSchema,
      required: true,
    },
    photoFileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    evidence: {
      type: [evidenceSchema],
      default: [],
    },
    reportedBy: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: reportStatuses,
      default: "Pending Verification",
    },
    remarks: {
      type: String,
      default: "",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Gives every new report a readable id like "HR-00125". The counter is
// incremented atomically, so two reports created at once never share an id.
hazardReportSchema.pre("validate", async function () {
  if (this.reportId) return;
  const counter = await Counter.findOneAndUpdate(
    { _id: "hazardReport" },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true }
  );
  this.reportId = `HR-${String(counter.seq).padStart(5, "0")}`;
});

module.exports = mongoose.model("HazardReport", hazardReportSchema);