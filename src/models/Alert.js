const mongoose = require('mongoose');

const deliveryLogSchema = new mongoose.Schema(
  {
    channel: { type: String, required: true },
    status: { type: String, required: true },
    reason: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
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
    targetAreas: { type: [{ type: String, trim: true }], required: true },
    channels: {
      type: [{ type: String, enum: ['SMS', 'Push'] }],
      required: true,
    },
    status: {
      type: String,
      enum: ['Draft', 'Dispatching', 'Dispatched', 'Partially Dispatched', 'Failed'],
      default: 'Draft',
      index: true,
    },
    deliveryLogs: { type: [deliveryLogSchema], default: [] },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', alertSchema);
