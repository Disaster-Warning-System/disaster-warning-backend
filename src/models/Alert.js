const mongoose = require('mongoose');

const severityValues = ['Advisory', 'Watch', 'Warning', 'Evacuation Order'];
const targetModeValues = ['District', 'River Basin'];
const statusValues = [
  'Draft',
  'Dispatching',
  'Dispatched',
  'Partially Dispatched',
  'Failed',
];

const deliveryLogSchema = new mongoose.Schema(
  {
    channel: { type: String, required: true },
    outcome: {
      type: String,
      required: true,
      default: function defaultOutcome() {
        return this.status;
      },
    },
    status: { type: String, required: true },
    errorDetails: { type: mongoose.Schema.Types.Mixed, default: '' },
    reason: { type: String, default: '' },
    attempts: { type: Number, min: 0, default: 1 },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

deliveryLogSchema.pre('validate', function setDeliveryOutcome(next) {
  this.outcome = this.outcome || this.status;
  this.status = this.status || this.outcome;
  this.errorDetails = this.errorDetails || this.reason || '';
  next();
});

const alertSchema = new mongoose.Schema(
  {
    alertId: { type: String, required: true, unique: true, index: true },
    sourceReportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HazardReport',
      default: null,
      index: true,
    },
    hazardType: { type: String, trim: true, default: 'General' },
    headline: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true, default: '' },
    // Retained for compatibility with the existing alert API.
    instruction: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: severityValues,
      required: true,
    },
    targetMode: {
      type: String,
      enum: targetModeValues,
      default: 'District',
    },
    targetAreas: { type: [{ type: String, trim: true }], required: true },
    selectedDeliveryChannels: { type: [String], default: [] },
    // Retained for compatibility with existing clients.
    channels: { type: [String], required: true },
    languages: {
      type: [{ type: String, enum: ['Sinhala', 'Tamil', 'English'] }],
      default: ['English'],
    },
    recipientCount: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: statusValues,
      default: 'Draft',
      index: true,
    },
    deliveryLogs: { type: [deliveryLogSchema], default: [] },
    dispatchStartedAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Alert || mongoose.model('Alert', alertSchema);
