const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { userRoles } = require("../models/User");
const { RIVER_BASINS, normalizeAreaName } = require("../utils/areas");
const selfServiceRoles = ["Citizen", "Volunteer"];

const createToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });

const toUserResponse = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  district: user.district,
  riverBasins: user.riverBasins || [],
  phoneNumber: user.phoneNumber || "",
});

const register = async (req, res) => {
  const { name, email, password, role, district, riverBasins, phoneNumber } = req.body || {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedDistrict = typeof district === "string" && district.trim()
    ? normalizeAreaName(district)
    : "";
  const normalizedRiverBasins = Array.isArray(riverBasins)
    ? [...new Set(riverBasins.map(normalizeAreaName).filter((area) => RIVER_BASINS.includes(area)))]
    : [];

  if (
    typeof name !== "string" || !name.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    typeof password !== "string" || password.length < 6 ||
    typeof district !== "string" || !normalizedDistrict
  ) {
    return res.status(400).json({
      success: false,
      message: "A name, valid email, password of at least 6 characters, and supported district are required.",
    });
  }

  if ((riverBasins !== undefined && !Array.isArray(riverBasins)) ||
      (Array.isArray(riverBasins) && normalizedRiverBasins.length !== new Set(riverBasins).size) ||
      (phoneNumber !== undefined && phoneNumber !== "" &&
        (typeof phoneNumber !== "string" || !/^\+[1-9]\d{7,14}$/.test(phoneNumber.trim())))) {
    return res.status(400).json({
      success: false,
      message: "Choose a supported district and river basin and provide a phone number in international format (+CC...).",
    });
  }

  if (role !== undefined && !userRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: `role must be one of: ${userRoles.join(", ")}`,
    });
  }

  if (role !== undefined && !selfServiceRoles.includes(role)) {
    return res.status(403).json({
      success: false,
      message: "Staff accounts must be provisioned by an authorized administrator.",
    });
  }

  if (await User.exists({ email: normalizedEmail })) {
    return res.status(409).json({
      success: false,
      message: "An account with this email already exists",
    });
  }

  let user;
  try {
    user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: role || "Citizen",
      district: normalizedDistrict,
      riverBasins: normalizedRiverBasins,
      phoneNumber: typeof phoneNumber === "string" ? phoneNumber.trim() : "",
    });
  } catch (error) {
    // The unique index is authoritative when concurrent requests pass User.exists.
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }
    throw error;
  }

  return res.status(201).json({
    success: true,
    data: { token: createToken(user), user: toUserResponse(user) },
  });
};

const login = async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      message: "email and password are required",
    });
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");
  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
  }

  return res.status(200).json({
    success: true,
    data: { token: createToken(user), user: toUserResponse(user) },
  });
};

const addPushToken = async (req, res) => {
  const token = req.body?.pushToken;
  if (typeof token !== "string" || !/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
    return res.status(400).json({ success: false, message: "A valid Expo push token is required." });
  }

  await User.findByIdAndUpdate(req.user.id, { $addToSet: { pushTokens: token } });
  return res.status(200).json({ success: true, message: "Push token registered." });
};

const removePushToken = async (req, res) => {
  const token = req.body?.pushToken;
  if (typeof token !== "string") {
    return res.status(400).json({ success: false, message: "A push token is required." });
  }

  await User.findByIdAndUpdate(req.user.id, { $pull: { pushTokens: token } });
  return res.status(200).json({ success: true, message: "Push token removed." });
};

const updateProfile = async (req, res) => {
  const { district, riverBasins, phoneNumber } = req.body || {};
  const normalizedDistrict = typeof district === 'string' ? normalizeAreaName(district) : '';
  const normalizedRiverBasins = Array.isArray(riverBasins)
    ? [...new Set(riverBasins.map(normalizeAreaName).filter((area) => RIVER_BASINS.includes(area)))]
    : null;
  if (!normalizedDistrict || !normalizedRiverBasins || normalizedRiverBasins.length !== riverBasins.length ||
      typeof phoneNumber !== 'string' || (phoneNumber.trim() && !/^\+[1-9]\d{7,14}$/.test(phoneNumber.trim()))) {
    return res.status(400).json({ success: false, message: 'Choose a supported district and river basin and provide a valid international phone number.' });
  }
  const user = await User.findByIdAndUpdate(req.user.id, {
    district: normalizedDistrict,
    riverBasins: normalizedRiverBasins,
    phoneNumber: phoneNumber.trim(),
  }, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
  return res.status(200).json({ success: true, data: { user: toUserResponse(user) } });
};

module.exports = { register, login, addPushToken, removePushToken, updateProfile };
