const express = require("express");
const {
  createHazardReport,
  getHazardReports,
  getHazardReportById,
  getMyHazardReports,
  addAdditionalInfo,
} = require("../controllers/hazardReportController");

const { protect, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createHazardReport);
// Every report is only visible to officers; citizens use /mine
router.get("/", protect, requireRole("DMC Officer"), getHazardReports);
// Declared before "/:id" so "mine" is not treated as a report id
router.get("/mine", protect, getMyHazardReports);
router.get("/:id", protect, getHazardReportById);
router.post("/:id/additional-info", protect, addAdditionalInfo);


module.exports = router;
