const mongoose = require("mongoose");
const HazardReport = require("../models/HazardReport");
const User = require("../models/User");
const Verification = require("../models/Verification");
const { verificationDecisions } = require("../models/Verification");

const PENDING = "Pending Verification";
const severityRank = { High: 0, Medium: 1, Low: 2 };

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getDashboard = async (req, res) => {
  const [pendingCount, recentActivity] = await Promise.all([
    HazardReport.countDocuments({ status: PENDING }),
    Verification.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("report", "reportId hazardType")
      .populate("officer", "name"),
  ]);

  return res.status(200).json({
    success: true,
    data: { pendingCount, recentActivity },
  });
};

const getReports = async (req, res) => {
  const { status = PENDING, hazardType, district, search, sort = "newest" } = req.query;

  const filter = { status };
  if (hazardType) filter.hazardType = hazardType;
  if (district) filter["location.district"] = new RegExp(`^${escapeRegex(district)}$`, "i");
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ reportId: pattern }, { description: pattern }];
  }

  const reports = await HazardReport.find(filter).sort({ createdAt: -1 });

  // Severity is a string, so rank it in JS (sort is stable, newest stays first within a level)
  if (sort === "severity") {
    reports.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  }

  const data = reports.map((report) => ({
    _id: report._id,
    reportId: report.reportId,
    hazardType: report.hazardType,
    severity: report.severity,
    description: report.description,
    district: report.location.district,
    evidenceCount: report.evidence.length + (report.photoFileId ? 1 : 0),
    status: report.status,
    createdAt: report.createdAt,
  }));

  return res.status(200).json({
    success: true,
    count: data.length,
    data,
  });
};

const getReportById = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid report id",
    });
  }

  const report = await HazardReport.findById(req.params.id).lean();
  if (!report) {
    return res.status(404).json({
      success: false,
      message: "Hazard report not found",
    });
  }

  // reportedBy is a plain string in the shared model; show the name when it is a user id
  if (report.reportedBy && mongoose.isValidObjectId(report.reportedBy)) {
    const reporter = await User.findById(report.reportedBy).select("name");
    if (reporter) report.reportedBy = { _id: reporter._id, name: reporter.name };
  }

  const verifications = await Verification.find({ report: report._id })
    .sort({ createdAt: -1 })
    .populate("officer", "name");

  return res.status(200).json({
    success: true,
    data: { ...report, verifications },
  });
};

const verifyReport = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid report id",
    });
  }

  const { decision, remarks } = req.body || {};
  const trimmedRemarks = typeof remarks === "string" ? remarks.trim() : "";

  if (!verificationDecisions.includes(decision)) {
    return res.status(400).json({
      success: false,
      message: `decision must be one of: ${verificationDecisions.join(", ")}`,
    });
  }

  if (decision !== "Verified" && !trimmedRemarks) {
    return res.status(400).json({
      success: false,
      message: `remarks are required when the decision is ${decision}`,
    });
  }

  const update = { status: decision, remarks: trimmedRemarks };
  if (decision === "Rejected") update.rejectionReason = trimmedRemarks;

  // Only updates the report if it is still pending, so two officers can't both decide it
  const report = await HazardReport.findOneAndUpdate(
    { _id: req.params.id, status: PENDING },
    update,
    { new: true }
  );

  if (!report) {
    const exists = await HazardReport.exists({ _id: req.params.id });
    return res.status(exists ? 409 : 404).json({
      success: false,
      message: exists
        ? "This report has already been processed by another officer"
        : "Hazard report not found",
    });
  }

  const verification = await Verification.create({
    report: report._id,
    officer: req.user.id,
    decision,
    remarks: trimmedRemarks,
  });

  return res.status(200).json({
    success: true,
    data: { report, verification },
  });
};

module.exports = {
  getDashboard,
  getReports,
  getReportById,
  verifyReport,
};
