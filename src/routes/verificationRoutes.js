const express = require("express");
const {
  getReports,
  getReportById,
  verifyReport,
  reopenReport,
  getWarningDraft,
} = require("../controllers/verificationController");
const { protect, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, requireRole("DMC Officer"));

router.get("/", getReports);
router.get("/:id", getReportById);
router.post("/:id/verification", verifyReport);
router.post("/:id/reopen", reopenReport);
router.get("/:id/warning-draft", getWarningDraft);

module.exports = router;
