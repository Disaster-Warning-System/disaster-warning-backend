const express = require("express");
const {
  getReports,
  getReportById,
  verifyReport,
} = require("../controllers/verificationController");
const { protect, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, requireRole("DMC Officer"));

router.get("/", getReports);
router.get("/:id", getReportById);
router.post("/:id/verification", verifyReport);

module.exports = router;
