const mongoose = require("mongoose");

// Stores running sequence numbers, e.g. { _id: "hazardReport", seq: 125 }
const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

module.exports = mongoose.model("Counter", counterSchema);
