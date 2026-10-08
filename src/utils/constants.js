const HAZARD_TYPES = ["Flood", "Landslide", "Cyclone", "Fire", "Earthquake", "Other"];

const SEVERITIES = ["Low", "Medium", "High"];

const REPORT_STATUS = {
  PENDING: "Pending Verification",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  NEEDS_INFO: "Needs More Information",
};

const REPORT_STATUSES = Object.values(REPORT_STATUS);

// The outcomes an officer can choose when reviewing a pending report
const OFFICER_DECISIONS = [
  REPORT_STATUS.VERIFIED,
  REPORT_STATUS.REJECTED,
  REPORT_STATUS.NEEDS_INFO,
];

// A pending report older than this is flagged as overdue on the officer dashboard
const PENDING_SLA_MINUTES = 30;

module.exports = {
  HAZARD_TYPES,
  SEVERITIES,
  REPORT_STATUS,
  REPORT_STATUSES,
  OFFICER_DECISIONS,
  PENDING_SLA_MINUTES,
};
