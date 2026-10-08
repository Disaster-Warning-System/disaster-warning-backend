const mongoose = require("mongoose");
const HazardReport = require("../models/HazardReport");
const User = require("../models/User");
const Verification = require("../models/Verification");
const {
  HAZARD_TYPES,
  REPORT_STATUS,
  REPORT_STATUSES,
  OFFICER_DECISIONS,
  PENDING_SLA_MINUTES,
} = require("../utils/constants");

const PENDING = REPORT_STATUS.PENDING;
const SORT_OPTIONS = ["newest", "severity"];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const NEARBY_DEGREES = 0.05; // roughly 5 km around the reported point
const NEARBY_WINDOW_MS = 48 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// Maps a report's severity to the alert level used by the Issue Warning component
const severityToAlertLevel = { High: "Warning", Medium: "Watch", Low: "Advisory" };

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const exactMatch = (text) => new RegExp(`^${escapeRegex(text)}$`, "i");

const overdueSince = () => new Date(Date.now() - PENDING_SLA_MINUTES * MINUTE_MS);

const parsePositiveInt = (value, fallback) => {
  if (value === undefined) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : null;
};

const badRequest = (res, message) =>
  res.status(400).json({ success: false, message });

const notFound = (res) =>
  res.status(404).json({ success: false, message: "Hazard report not found" });

// Moves a report from one status to another and records who did it. The status filter makes
// the change atomic, so only one officer can act on a report. MongoDB transactions need a
// replica set, so if writing the Verification record fails the report change is undone instead.
const recordDecision = async ({ reportId, fromStatus, update, decision, remarks, officerId }) => {
  const previous = await HazardReport.findOneAndUpdate(
    { _id: reportId, status: fromStatus },
    update,
    { returnDocument: "before" }
  );
  if (!previous) return null;

  let verification;
  try {
    verification = await Verification.create({
      report: previous._id,
      officer: officerId,
      decision,
      remarks,
    });
  } catch (error) {
    await HazardReport.updateOne(
      { _id: previous._id, status: update.status },
      {
        status: previous.status,
        remarks: previous.remarks,
        rejectionReason: previous.rejectionReason,
      }
    ).catch((undoError) => {
      console.error("Failed to undo report status change", undoError);
    });
    throw error;
  }

  const report = await HazardReport.findById(previous._id);
  return { report, verification };
};

// Explains why recordDecision found nothing to update
const sendDecisionConflict = async (res, reportId, conflictMessage) => {
  const exists = await HazardReport.exists({ _id: reportId });
  if (!exists) return notFound(res);
  return res.status(409).json({ success: false, message: conflictMessage });
};

const getDashboard = async (req, res) => {
  const [statusGroups, overdueCount, recentActivity] = await Promise.all([
    HazardReport.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    HazardReport.countDocuments({ status: PENDING, updatedAt: { $lt: overdueSince() } }),
    Verification.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("report", "reportId hazardType")
      .populate("officer", "name"),
  ]);

  const statusCounts = Object.fromEntries(REPORT_STATUSES.map((status) => [status, 0]));
  for (const group of statusGroups) statusCounts[group._id] = group.count;

  return res.status(200).json({
    success: true,
    data: {
      pendingCount: statusCounts[PENDING],
      overdueCount,
      statusCounts,
      recentActivity,
    },
  });
};

const getReports = async (req, res) => {
  const { status = PENDING, hazardType, district, search, sort = "newest" } = req.query;

  if (!REPORT_STATUSES.includes(status)) {
    return badRequest(res, `status must be one of: ${REPORT_STATUSES.join(", ")}`);
  }
  if (hazardType !== undefined && !HAZARD_TYPES.includes(hazardType)) {
    return badRequest(res, `hazardType must be one of: ${HAZARD_TYPES.join(", ")}`);
  }
  if (!SORT_OPTIONS.includes(sort)) {
    return badRequest(res, `sort must be one of: ${SORT_OPTIONS.join(", ")}`);
  }

  const page = parsePositiveInt(req.query.page, 1);
  const limit = parsePositiveInt(req.query.limit, DEFAULT_PAGE_SIZE);
  if (page === null) return badRequest(res, "page must be a whole number of 1 or more");
  if (limit === null || limit > MAX_PAGE_SIZE) {
    return badRequest(res, `limit must be a whole number from 1 to ${MAX_PAGE_SIZE}`);
  }

  const filter = { status };
  if (hazardType) filter.hazardType = hazardType;
  if (typeof district === "string" && district) filter["location.district"] = exactMatch(district);
  if (typeof search === "string" && search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ reportId: pattern }, { description: pattern }];
  }

  // Severity is stored as text, so rank it in the query to sort and page in the database
  const sortStage =
    sort === "severity" ? { severityRank: 1, createdAt: -1 } : { createdAt: -1 };

  const [result] = await HazardReport.aggregate([
    { $match: filter },
    {
      $addFields: {
        severityRank: {
          $switch: {
            branches: [
              { case: { $eq: ["$severity", "High"] }, then: 0 },
              { case: { $eq: ["$severity", "Medium"] }, then: 1 },
            ],
            default: 2,
          },
        },
      },
    },
    { $sort: sortStage },
    {
      $facet: {
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const total = result.total[0]?.count ?? 0;
  const now = Date.now();
  const slaCutoff = overdueSince();

  const data = result.data.map((report) => ({
    _id: report._id,
    reportId: report.reportId,
    hazardType: report.hazardType,
    severity: report.severity,
    description: report.description,
    district: report.location?.district ?? "",
    evidenceCount: (report.evidence?.length ?? 0) + (report.photoFileId ? 1 : 0),
    status: report.status,
    createdAt: report.createdAt,
    ageMinutes: Math.floor((now - report.createdAt) / MINUTE_MS),
    // updatedAt is when the report last entered the queue (submitted, replied to or reopened)
    overdue: report.status === PENDING && report.updatedAt < slaCutoff,
  }));

  return res.status(200).json({
    success: true,
    count: data.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data,
  });
};

// Other reports of the same hazard close by in place and time, to spot duplicates
const findNearbyReports = (report) => {
  const createdAt = new Date(report.createdAt).getTime();
  const filter = {
    _id: { $ne: report._id },
    hazardType: report.hazardType,
    createdAt: {
      $gte: new Date(createdAt - NEARBY_WINDOW_MS),
      $lte: new Date(createdAt + NEARBY_WINDOW_MS),
    },
  };

  const { latitude, longitude, district } = report.location || {};
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    filter["location.latitude"] = { $gte: latitude - NEARBY_DEGREES, $lte: latitude + NEARBY_DEGREES };
    filter["location.longitude"] = { $gte: longitude - NEARBY_DEGREES, $lte: longitude + NEARBY_DEGREES };
  } else if (district) {
    filter["location.district"] = exactMatch(district);
  } else {
    return [];
  }

  return HazardReport.find(filter)
    .sort({ createdAt: -1 })
    .limit(5)
    .select("reportId status severity description location.district createdAt")
    .lean();
};

// How the reporter's earlier reports were judged, to help weigh their credibility
const getReporterHistory = async (report) => {
  if (!report.reportedBy) return null;
  const groups = await HazardReport.aggregate([
    { $match: { reportedBy: report.reportedBy, _id: { $ne: report._id } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const countOf = (status) => groups.find((group) => group._id === status)?.count ?? 0;
  return {
    total: groups.reduce((sum, group) => sum + group.count, 0),
    verified: countOf(REPORT_STATUS.VERIFIED),
    rejected: countOf(REPORT_STATUS.REJECTED),
  };
};

const getReportById = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return badRequest(res, "Invalid report id");
  }

  const report = await HazardReport.findById(req.params.id).lean();
  if (!report) return notFound(res);

  const [nearbyReports, reporterHistory, verifications] = await Promise.all([
    findNearbyReports(report),
    getReporterHistory(report),
    Verification.find({ report: report._id })
      .sort({ createdAt: -1 })
      .populate("officer", "name"),
  ]);

  // reportedBy is a plain string in the shared model; show the name when it is a user id
  if (report.reportedBy && mongoose.isValidObjectId(report.reportedBy)) {
    const reporter = await User.findById(report.reportedBy).select("name");
    if (reporter) report.reportedBy = { _id: reporter._id, name: reporter.name };
  }

  return res.status(200).json({
    success: true,
    data: {
      ...report,
      photoUrl: report.photoFileId ? `/api/uploads/hazard-photo/${report.photoFileId}` : null,
      nearbyReports,
      reporterHistory,
      verifications,
    },
  });
};

const verifyReport = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return badRequest(res, "Invalid report id");
  }

  const { decision, remarks } = req.body || {};
  const trimmedRemarks = typeof remarks === "string" ? remarks.trim() : "";

  if (!OFFICER_DECISIONS.includes(decision)) {
    return badRequest(res, `decision must be one of: ${OFFICER_DECISIONS.join(", ")}`);
  }

  if (decision !== REPORT_STATUS.VERIFIED && !trimmedRemarks) {
    return badRequest(res, `remarks are required when the decision is ${decision}`);
  }

  const update = { status: decision, remarks: trimmedRemarks };
  if (decision === REPORT_STATUS.REJECTED) update.rejectionReason = trimmedRemarks;

  const result = await recordDecision({
    reportId: req.params.id,
    fromStatus: PENDING,
    update,
    decision,
    remarks: trimmedRemarks,
    officerId: req.user.id,
  });

  if (!result) {
    return sendDecisionConflict(
      res,
      req.params.id,
      "This report has already been processed by another officer"
    );
  }

  return res.status(200).json({ success: true, data: result });
};

// Sends a wrongly rejected report back to the verification queue
const reopenReport = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return badRequest(res, "Invalid report id");
  }

  const { remarks } = req.body || {};
  const trimmedRemarks = typeof remarks === "string" ? remarks.trim() : "";
  if (!trimmedRemarks) {
    return badRequest(res, "remarks are required to reopen a report");
  }

  const result = await recordDecision({
    reportId: req.params.id,
    fromStatus: REPORT_STATUS.REJECTED,
    update: { status: PENDING, remarks: trimmedRemarks, rejectionReason: "" },
    decision: "Reopened",
    remarks: trimmedRemarks,
    officerId: req.user.id,
  });

  if (!result) {
    return sendDecisionConflict(res, req.params.id, "Only rejected reports can be reopened");
  }

  return res.status(200).json({ success: true, data: result });
};

// Pre-fills the Issue Warning form from a verified report (link to Component 3)
const getWarningDraft = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return badRequest(res, "Invalid report id");
  }

  const report = await HazardReport.findById(req.params.id).lean();
  if (!report) return notFound(res);

  if (report.status !== REPORT_STATUS.VERIFIED) {
    return res.status(409).json({
      success: false,
      message: "A warning can only be drafted from a verified report",
    });
  }

  const { district, address } = report.location || {};
  const place = district || address || "the reported area";

  return res.status(200).json({
    success: true,
    data: {
      headline: `${report.hazardType} reported in ${place}`,
      instruction: "",
      severity: severityToAlertLevel[report.severity] ?? "Advisory",
      targetAreas: district ? [district] : [],
      channels: ["SMS", "Push"],
      sourceReport: {
        _id: report._id,
        reportId: report.reportId,
        hazardType: report.hazardType,
        description: report.description,
        location: report.location,
      },
    },
  });
};

module.exports = {
  getDashboard,
  getReports,
  getReportById,
  verifyReport,
  reopenReport,
  getWarningDraft,
};
