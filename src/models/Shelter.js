const mongoose = require("mongoose");

const operationalStatuses = ["Open", "Closed"];
const locationPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], required: true },
    // GeoJSON stores coordinates as [longitude, latitude].
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(coordinates) {
          if (!Array.isArray(coordinates) || coordinates.length !== 2)
            return false;
          const [longitude, latitude] = coordinates;
          return (
            Number.isFinite(longitude) &&
            longitude >= -180 &&
            longitude <= 180 &&
            Number.isFinite(latitude) &&
            latitude >= -90 &&
            latitude <= 90
          );
        },
        message:
          "Select a map point with longitude from -180 to 180 and latitude from -90 to 90",
      },
    },
  },
  { _id: false },
);

const occupancyHistoryEntrySchema = new mongoose.Schema(
  {
    occupancy: { type: Number, required: true, min: 0 },
    operationalStatus: { type: String, enum: operationalStatuses, required: true },
    changedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: true },
);

const shelterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    location: { type: String, required: true, trim: true, maxlength: 240 },
    locationPoint: { type: locationPointSchema, default: undefined },
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
            // Query validators do not have the current document; the service checks
            // occupancy against the loaded capacity before issuing an update.
            if (this instanceof mongoose.Query) return true;
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
    // Store the GridFS file id; image bytes live in the shelterImages bucket.
    imageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Keep the most recent occupancy/status snapshots on the shelter document for atomic updates.
    occupancyHistory: {
      type: [occupancyHistoryEntrySchema],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

shelterSchema.index({ locationPoint: "2dsphere" }, { sparse: true });

shelterSchema.virtual("availableSpaces").get(function () {
  return Math.max(this.capacity - this.occupancy, 0);
});

// Derive "Full" from occupancy so stored operational status cannot go stale.
shelterSchema.virtual("availabilityStatus").get(function () {
  return this.occupancy >= this.capacity ? "Full" : this.operationalStatus;
});

module.exports = mongoose.model("Shelter", shelterSchema);
