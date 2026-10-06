const mongoose = require("mongoose");
const HazardReport = require("../models/HazardReport");
const { validateHazardReport } = require("../validators/hazardReportValidator");

const createHazardReport = async (req, res) => {
  const errors = validateHazardReport(req.body);
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  try {
    const { hazardType, description, location, photoUrl, reportedBy } = req.body;
    const hazardReport = await HazardReport.create({
      hazardType,
      description: description.trim(),
      location: {
        latitude: location.latitude ?? null,
        longitude: location.longitude ?? null,
        address:
          typeof location.address === "string" ? location.address.trim() : "",
      },
      photoUrl: photoUrl ?? null,
      reportedBy: reportedBy ?? null,
      status: "Pending Verification",
    });

    return res.status(201).json({
      success: true,
      message: "Hazard report submitted successfully",
      data: hazardReport,
    });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
      });
    }

    console.error("Failed to create hazard report");
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
    });
  }
};

const getHazardReports = async (req, res) => {
  try {
    const reports = await HazardReport.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    console.error("Failed to retrieve hazard reports");
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
    });
  }
};

const getHazardReportById = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({
      success: false,
      message: "Hazard report not found",
    });
  }

  try {
    const report = await HazardReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Hazard report not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Failed to retrieve hazard report");
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
    });
  }
};

module.exports = {
  createHazardReport,
  getHazardReports,
  getHazardReportById,
};