const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, token missing",
    });
  }

  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, token invalid",
    });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to perform this action",
    });
  }
  return next();
};

module.exports = { protect, requireRole };
