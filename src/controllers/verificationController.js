const {
  VerificationServiceError,
  getDashboardStats,
  listReports,
  getReportDetails,
  decide,
  reopen,
  buildWarningDraft,
} = require("../services/verificationService");

const sendError = (res, error) => {
  if (error instanceof VerificationServiceError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error(error);
  return res.status(500).json({ success: false, message: "An unexpected error occurred" });
};

const getDashboard = async (req, res) => {
  try {
    const data = await getDashboardStats();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

const getReports = async (req, res) => {
  try {
    const result = await listReports(req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error);
  }
};

const getReportById = async (req, res) => {
  try {
    const data = await getReportDetails(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

const verifyReport = async (req, res) => {
  const { decision, remarks, checklist, severity } = req.body || {};
  try {
    const data = await decide({
      reportId: req.params.id,
      decision,
      remarks,
      checklist,
      severity,
      officerId: req.user.id,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

const reopenReport = async (req, res) => {
  try {
    const data = await reopen({
      reportId: req.params.id,
      remarks: (req.body || {}).remarks,
      officerId: req.user.id,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

const getWarningDraft = async (req, res) => {
  try {
    const data = await buildWarningDraft(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  getDashboard,
  getReports,
  getReportById,
  verifyReport,
  reopenReport,
  getWarningDraft,
};
