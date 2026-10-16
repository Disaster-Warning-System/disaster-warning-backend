const mongoose = require("mongoose");

const { OFFICER_DECISIONS, SEVERITIES } = require("../utils/constants");

// "Reopened" is recorded when an officer sends a rejected report back to the queue
const verificationDecisions = [...OFFICER_DECISIONS, "Reopened"];

// What the officer personally checked before deciding. These are the officer's judgements,
// not checks the system performs.
const checklistItems = ["locationChecked", "evidenceReviewed", "duplicatesChecked"];

const checklistSchema = new mongoose.Schema(
  Object.fromEntries(
    checklistItems.map((item) => [item, { type: Boolean, default: false }])
  ),
  { _id: false }
);

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
    checklist: {
      type: checklistSchema,
      default: () => ({}),
    },
    // The severity the officer confirmed or set, so every priority label has a known source
    severity: {
      type: String,
      enum: SEVERITIES,
    },
  },
  { timestamps: true }
);

verificationSchema.index({ report: 1, createdAt: -1 });

module.exports = mongoose.model("Verification", verificationSchema);
module.exports.verificationDecisions = verificationDecisions;
module.exports.checklistItems = checklistItems;
