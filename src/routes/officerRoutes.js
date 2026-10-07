const express = require("express");
const { getDashboard } = require("../controllers/verificationController");
const { protect, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/dashboard", protect, requireRole("DMC Officer"), getDashboard);

module.exports = router;
