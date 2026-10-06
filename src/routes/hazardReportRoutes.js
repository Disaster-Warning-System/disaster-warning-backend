const express = require("express");
const {
  createHazardReport,
  getHazardReports,
  getHazardReportById,
} = require("../controllers/hazardReportController");

const router = express.Router();

router.post("/", createHazardReport);
router.get("/", getHazardReports);
router.get("/:id", getHazardReportById);

module.exports = router;