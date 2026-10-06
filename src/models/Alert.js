const mongoose = require('mongoose');

const deliveryLogSchema = new mongoose.Schema(
  {
    channel: { type: String, required: true },
    status: { type: String, enum: ['Success', 'Failed'], required: true },
    recipients: { type: Number, default: 0 },
    reason: String,
    deliveredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const alertSchema = new mongoose.Schema(
  {
    alertId: { type: String, required: true, unique: true, index: true },
    headline: { type: String, required: true, trim: true },
    instruction: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ['Advisory', 'Watch', 'Warning', 'Evacuation Order'],
      required: true,
    },
    districts: { type: [String], required: true },
    channels: { type: [String], enum: ['SMS', 'Push'], required: true },
    status: {
      type: String,
      enum: ['Draft', 'Dispatching', 'Dispatched', 'Partially Dispatched', 'Failed'],
      required: true,
      index: true,
    },
    deliveryLogs: { type: [deliveryLogSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', alertSchema);
