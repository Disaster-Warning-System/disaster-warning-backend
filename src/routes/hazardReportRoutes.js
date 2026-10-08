const express = require("express");
const {
  createHazardReport,
  getHazardReports,
  getHazardReportById,
  getMyHazardReports,
  addAdditionalInfo,
} = require("../controllers/hazardReportController");
const { protect, optionalAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", optionalAuth, createHazardReport);
router.get("/", getHazardReports);
// Declared before "/:id" so "mine" is not treated as a report id
router.get("/mine", protect, getMyHazardReports);
router.get("/:id", getHazardReportById);
router.post("/:id/additional-info", protect, addAdditionalInfo);

module.exports = router;
