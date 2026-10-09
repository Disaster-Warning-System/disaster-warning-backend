const mongoose = require("mongoose");

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
  },
  { _id: false }
);

const hazardReportSchema = new mongoose.Schema(
  {
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
    location: {
      type: locationSchema,
      required: true,
    },
    photoFileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
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

module.exports = mongoose.model("HazardReport", hazardReportSchema);