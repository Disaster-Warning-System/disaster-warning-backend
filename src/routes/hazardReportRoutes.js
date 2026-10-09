const express = require("express");
const {
  createHazardReport,
  getHazardReports,
  getHazardReportById,
} = require("../controllers/hazardReportController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createHazardReport);
router.get("/", protect, getHazardReports);
router.get("/:id", protect, getHazardReportById);

module.exports = router;