const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { DISTRICTS, RIVER_BASINS } = require("../utils/areas");

const userRoles = ["Citizen", "Volunteer", "DMC Officer", "District Officer"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: userRoles,
      default: "Citizen",
    },
    district: {
      type: String,
      default: "",
      enum: ["", ...DISTRICTS],
    },
    riverBasins: {
      type: [{ type: String, enum: RIVER_BASINS }],
      default: [],
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: "",
    },
    pushTokens: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.index({ role: 1, district: 1 });
userSchema.index({ role: 1, riverBasins: 1 });

module.exports = mongoose.model("User", userSchema);
module.exports.userRoles = userRoles;
