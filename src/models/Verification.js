const mongoose = require("mongoose");

const verificationDecisions = ["Verified", "Rejected", "Needs More Information"];

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

module.exports = mongoose.model("Verification", verificationSchema);
module.exports.verificationDecisions = verificationDecisions;
