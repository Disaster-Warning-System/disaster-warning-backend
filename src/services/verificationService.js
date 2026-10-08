const mongoose = require("mongoose");
const HazardReport = require("../models/HazardReport");
const User = require("../models/User");
const Verification = require("../models/Verification");
const { checklistItems } = require("../models/Verification");
const {
  HAZARD_TYPES,
  SEVERITIES,
  REPORT_STATUS,
  REPORT_STATUSES,
  OFFICER_DECISIONS,
  PENDING_SLA_MINUTES,
} = require("../utils/constants");

class VerificationServiceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "VerificationServiceError";
    this.statusCode = statusCode;
  }
}

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

const badRequest = (message) => new VerificationServiceError(message, 400);

const reportNotFound = () => new VerificationServiceError("Hazard report not found", 404);

const assertValidId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid report id");
};

const trimText = (value) => (typeof value === "string" ? value.trim() : "");

const hasEvidence = (report) =>
  Boolean(report.photoFileId) || (report.evidence?.length ?? 0) > 0;

// Moves a report from one status to another and records who did it. The status filter makes
// the change atomic, so only one officer can act on a report. MongoDB transactions need a
// replica set, so if writing the Verification record fails the report change is undone instead.
const recordDecision = async ({ reportId, fromStatus, update, verificationData, conflictMessage }) => {
  const previous = await HazardReport.findOneAndUpdate(
    { _id: reportId, status: fromStatus },
    update,
    { returnDocument: "before" }
  );

  if (!previous) {
    const exists = await HazardReport.exists({ _id: reportId });
    if (!exists) throw reportNotFound();
    throw new VerificationServiceError(conflictMessage, 409);
  }

  let verification;
  try {
    verification = await Verification.create({
      report: previous._id,
      severity: previous.severity,
      ...verificationData,
    });
  } catch (error) {
    await HazardReport.updateOne(
      { _id: previous._id, status: update.status },
      {
        status: previous.status,
        remarks: previous.remarks,
        rejectionReason: previous.rejectionReason,
        severity: previous.severity,
      }
    ).catch((undoError) => {
      console.error("Failed to undo report status change", undoError);
    });
    throw error;
  }

  const report = await HazardReport.findById(previous._id);
  return { report, verification };
};

const getDashboardStats = async () => {
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

  return {
    pendingCount: statusCounts[PENDING],
    overdueCount,
    statusCounts,
    recentActivity,
  };
};

const listReports = async (query) => {
  const { status = PENDING, hazardType, district, search, sort = "newest" } = query;

  if (!REPORT_STATUSES.includes(status)) {
    throw badRequest(`status must be one of: ${REPORT_STATUSES.join(", ")}`);
  }
  if (hazardType !== undefined && !HAZARD_TYPES.includes(hazardType)) {
    throw badRequest(`hazardType must be one of: ${HAZARD_TYPES.join(", ")}`);
  }
  if (!SORT_OPTIONS.includes(sort)) {
    throw badRequest(`sort must be one of: ${SORT_OPTIONS.join(", ")}`);
  }

  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, DEFAULT_PAGE_SIZE);
  if (page === null) throw badRequest("page must be a whole number of 1 or more");
  if (limit === null || limit > MAX_PAGE_SIZE) {
    throw badRequest(`limit must be a whole number from 1 to ${MAX_PAGE_SIZE}`);
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

  return {
    count: data.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data,
  };
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

const getReportDetails = async (id) => {
  assertValidId(id);

  const report = await HazardReport.findById(id).lean();
  if (!report) throw reportNotFound();

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

  return {
    ...report,
    photoUrl: report.photoFileId ? `/api/uploads/hazard-photo/${report.photoFileId}` : null,
    nearbyReports,
    reporterHistory,
    verifications,
  };
};

const validateChecklist = (checklist) => {
  if (checklist === undefined) return {};
  if (!checklist || typeof checklist !== "object" || Array.isArray(checklist)) {
    throw badRequest("checklist must be an object");
  }
  for (const [item, value] of Object.entries(checklist)) {
    if (!checklistItems.includes(item)) {
      throw badRequest(`checklist items must be: ${checklistItems.join(", ")}`);
    }
    if (typeof value !== "boolean") {
      throw badRequest(`checklist.${item} must be true or false`);
    }
  }
  return checklist;
};

// Records the officer's decision. The officer decides; the system only checks the decision is
// complete and stores it.
const decide = async ({ reportId, decision, remarks, checklist, severity, officerId }) => {
  assertValidId(reportId);

  const trimmedRemarks = trimText(remarks);
  if (!OFFICER_DECISIONS.includes(decision)) {
    throw badRequest(`decision must be one of: ${OFFICER_DECISIONS.join(", ")}`);
  }
  if (decision !== REPORT_STATUS.VERIFIED && !trimmedRemarks) {
    throw badRequest(`remarks are required when the decision is ${decision}`);
  }
  const checkedItems = validateChecklist(checklist);
  if (severity !== undefined && !SEVERITIES.includes(severity)) {
    throw badRequest(`severity must be one of: ${SEVERITIES.join(", ")}`);
  }

  if (decision === REPORT_STATUS.VERIFIED) {
    if (checkedItems.locationChecked !== true) {
      throw badRequest("Confirm that you checked the reported location before verifying");
    }
    const report = await HazardReport.findById(reportId).select("photoFileId evidence").lean();
    if (!report) throw reportNotFound();
    if (hasEvidence(report) && checkedItems.evidenceReviewed !== true) {
      throw badRequest("Confirm that you reviewed the attached evidence before verifying");
    }
  }

  const update = { status: decision, remarks: trimmedRemarks };
  if (decision === REPORT_STATUS.REJECTED) update.rejectionReason = trimmedRemarks;
  if (severity !== undefined) update.severity = severity;

  return recordDecision({
    reportId,
    fromStatus: PENDING,
    update,
    verificationData: {
      officer: officerId,
      decision,
      remarks: trimmedRemarks,
      checklist: checkedItems,
      ...(severity !== undefined ? { severity } : {}),
    },
    conflictMessage: "This report has already been processed by another officer",
  });
};

// Sends a wrongly rejected report back to the verification queue
const reopen = async ({ reportId, remarks, officerId }) => {
  assertValidId(reportId);

  const trimmedRemarks = trimText(remarks);
  if (!trimmedRemarks) throw badRequest("remarks are required to reopen a report");

  return recordDecision({
    reportId,
    fromStatus: REPORT_STATUS.REJECTED,
    update: { status: PENDING, remarks: trimmedRemarks, rejectionReason: "" },
    verificationData: { officer: officerId, decision: "Reopened", remarks: trimmedRemarks },
    conflictMessage: "Only rejected reports can be reopened",
  });
};

// Pre-fills the Issue Warning form from a verified report (link to Component 3)
const buildWarningDraft = async (id) => {
  assertValidId(id);

  const report = await HazardReport.findById(id).lean();
  if (!report) throw reportNotFound();

  if (report.status !== REPORT_STATUS.VERIFIED) {
    throw new VerificationServiceError(
      "A warning can only be drafted from a verified report",
      409
    );
  }

  const { district, address } = report.location || {};
  const place = district || address || "the reported area";

  return {
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
  };
};

module.exports = {
  VerificationServiceError,
  getDashboardStats,
  listReports,
  getReportDetails,
  decide,
  reopen,
  buildWarningDraft,
};
