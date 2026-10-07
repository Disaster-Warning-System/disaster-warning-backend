const mongoose = require("mongoose");

const operationalStatuses = ["Open", "Closed"];

const shelterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    location: { type: String, required: true, trim: true, maxlength: 240 },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Capacity must be a whole number",
      },
    },
    occupancy: {
      type: Number,
      required: true,
      min: 0,
      validate: [
        {
          validator: Number.isInteger,
          message: "Occupancy must be a whole number",
        },
        {
          validator(value) {
            return value <= this.capacity;
          },
          message: "Occupancy cannot exceed capacity",
        },
      ],
    },
    operationalStatus: {
      type: String,
      enum: operationalStatuses,
      default: "Open",
    },
    remarks: { type: String, trim: true, default: "", maxlength: 500 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

shelterSchema.virtual("availableSpaces").get(function () {
  return Math.max(this.capacity - this.occupancy, 0);
});

// Derive "Full" from occupancy so stored operational status cannot go stale.
shelterSchema.virtual("availabilityStatus").get(function () {
  return this.occupancy >= this.capacity ? "Full" : this.operationalStatus;
});

module.exports = mongoose.model("Shelter", shelterSchema);
