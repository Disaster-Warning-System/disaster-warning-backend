const mongoose = require("mongoose");

const { OFFICER_DECISIONS } = require("../utils/constants");

// "Reopened" is recorded when an officer sends a rejected report back to the queue
const verificationDecisions = [...OFFICER_DECISIONS, "Reopened"];

const verificationSchema = new mongoose.Schema(
  {
    report: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HazardReport",
      required: true,
    },
    officer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    decision: {
      type: String,
      enum: verificationDecisions,
      required: true,
    },
    remarks: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

verificationSchema.index({ report: 1, createdAt: -1 });

module.exports = mongoose.model("Verification", verificationSchema);
module.exports.verificationDecisions = verificationDecisions;
