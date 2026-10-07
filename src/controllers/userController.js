const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { userRoles } = require("../models/User");

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
});

const register = async (req, res) => {
  const { name, email, password, role, district } = req.body || {};

  if (
    typeof name !== "string" || !name.trim() ||
    typeof email !== "string" || !email.trim() ||
    typeof password !== "string" || password.length < 6
  ) {
    return res.status(400).json({
      success: false,
      message: "name, email and a password of at least 6 characters are required",
    });
  }

  if (role !== undefined && !userRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: `role must be one of: ${userRoles.join(", ")}`,
    });
  }

  if (await User.exists({ email: email.trim().toLowerCase() })) {
    return res.status(409).json({
      success: false,
      message: "An account with this email already exists",
    });
  }

  const user = await User.create({
    name: name.trim(),
    email,
    password,
    role,
    district: typeof district === "string" ? district.trim() : "",
  });

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

module.exports = { register, login };
