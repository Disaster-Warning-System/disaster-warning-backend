const mongoose = require("mongoose");
const HazardReport = require("../models/HazardReport");
const { validateHazardReport } = require("../validators/hazardReportValidator");
const { findFile } = require("../services/gridfsService");
const { REPORT_STATUS } = require("../utils/constants");

const MAX_ADDITIONAL_INFO_LENGTH = 1000;

const createHazardReport = async (req, res) => {
  const errors = validateHazardReport(req.body);
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  const idempotencyKey = req.get("Idempotency-Key")?.trim();

  try {
    const { hazardType, description, severity, location, photoFileId, evidence } = req.body;
    if (idempotencyKey) {
      const existingReport = await HazardReport.findOne({ idempotencyKey });
      if (existingReport) {
        return res.status(201).json({
          success: true,
          message: "Hazard report submitted successfully",
          report: existingReport,
          data: existingReport,
        });
      }
    }
    let storedPhotoFileId = null;
    if (photoFileId !== undefined && photoFileId !== null) {
      if (!mongoose.isValidObjectId(photoFileId) || !(await findFile(photoFileId))) {
        return res.status(400).json({
          success: false,
          message: "The referenced photo does not exist",
        });
      }
      storedPhotoFileId = photoFileId;
    }
    const hazardReport = await HazardReport.create({
      hazardType,
      description: description.trim(),
      severity: severity ?? "Medium",
      location: {
        latitude: location.latitude ?? null,
        longitude: location.longitude ?? null,
        address:
          typeof location.address === "string" ? location.address.trim() : "",
        district:
          typeof location.district === "string" ? location.district.trim() : "",
      },
      photoFileId: storedPhotoFileId,
      evidence: Array.isArray(evidence)
        ? evidence.map((item) => ({ url: item.url.trim(), type: item.type || "image" }))
        : [],
      // Taken from the token, never the body, so a report can't be attributed to someone else
      reportedBy: req.user?.id ?? null,
      idempotencyKey: idempotencyKey || undefined,
      status: "Pending Verification",
    });

    return res.status(201).json({
      success: true,
      message: "Hazard report submitted successfully",
      report: hazardReport,
      data: hazardReport,
    });
  } catch (error) {
    if (error?.code === 11000 && idempotencyKey) {
      const existingReport = await HazardReport.findOne({ idempotencyKey });
      if (existingReport) {
        return res.status(201).json({
          success: true,
          message: "Hazard report submitted successfully",
          report: existingReport,
          data: existingReport,
        });
      }
    }
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
    // Only officers and the reporter may see a report; others get 404 so they can't tell it exists
    const canView =
      report &&
      (req.user.role === "DMC Officer" || report.reportedBy === req.user.id);
    if (!canView) {
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

// Lets a citizen track their own reports and read the officer's decision and remarks
const getMyHazardReports = async (req, res) => {
  const reports = await HazardReport.find({ reportedBy: req.user.id })
    .sort({ createdAt: -1 })
    .select(
      "reportId hazardType severity description location status remarks rejectionReason additionalInfo createdAt updatedAt"
    );

  return res.status(200).json({
    success: true,
    count: reports.length,
    data: reports,
  });
};

// The reporter answers a "Needs More Information" request, which sends the report back to the queue
const addAdditionalInfo = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({
      success: false,
      message: "Hazard report not found",
    });
  }

  const { message, photoFileId } = req.body || {};
  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!trimmedMessage || trimmedMessage.length > MAX_ADDITIONAL_INFO_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `message is required and must be ${MAX_ADDITIONAL_INFO_LENGTH} characters or fewer`,
    });
  }

  if (photoFileId !== undefined && photoFileId !== null) {
    if (!mongoose.isValidObjectId(photoFileId) || !(await findFile(photoFileId))) {
      return res.status(400).json({
        success: false,
        message: "The referenced photo does not exist",
      });
    }
  }

  // Only matches while the report still needs information, so a reply can't be applied twice
  const report = await HazardReport.findOneAndUpdate(
    {
      _id: req.params.id,
      reportedBy: req.user.id,
      status: REPORT_STATUS.NEEDS_INFO,
    },
    {
      $push: {
        additionalInfo: { message: trimmedMessage, photoFileId: photoFileId ?? null },
      },
      $set: { status: REPORT_STATUS.PENDING },
    },
    { returnDocument: "after", runValidators: true }
  );

  if (!report) {
    const ownReport = await HazardReport.exists({
      _id: req.params.id,
      reportedBy: req.user.id,
    });
    return res.status(ownReport ? 409 : 404).json({
      success: false,
      message: ownReport
        ? "This report is not waiting for more information"
        : "Hazard report not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Additional information sent for verification",
    data: report,
  });
};

module.exports = {
  createHazardReport,
  getHazardReports,
  getHazardReportById,
  getMyHazardReports,
  addAdditionalInfo,
};