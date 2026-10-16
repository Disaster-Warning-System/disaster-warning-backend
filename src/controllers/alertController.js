const { randomUUID } = require('crypto');
const Alert = require('../models/Alert');
const mongoose = require('mongoose');
const HazardReport = require('../models/HazardReport');
const User = require('../models/User');
const recipientResolver = require('../services/recipientResolver');
const dispatchModule = require('../services/alertDispatchService');
const { DISTRICTS, RIVER_BASINS, normalizeAreaName } = require('../utils/areas');

const resolveTargetRecipients = recipientResolver.resolveRegisteredRecipients || recipientResolver.resolveRecipients;
const { RecipientResolutionError } = recipientResolver;
const { dispatchAlertChannels } = dispatchModule;
const allowedSeverities = ['Advisory', 'Watch', 'Warning', 'Evacuation Order'];
const allowedChannels = ['SMS', 'Push'];
const allowedLanguages = ['Sinhala', 'Tamil', 'English'];
const allowedTargetModes = ['District', 'River Basin'];
const activeStatuses = ['Dispatching', 'Dispatched', 'Partially Dispatched'];
const newAlertId = () => `ALT-${Date.now()}-${randomUUID().slice(0, 8)}`;

const getPayload = (body = {}) => ({
  ...body,
  requestedChannels: body.selectedDeliveryChannels || body.channels,
  warningInstructions: body.instructions || body.instruction,
});

const validatePayload = ({ hazardType, headline, warningInstructions, severity, targetMode, targetAreas, requestedChannels, languages }) => (
  (hazardType !== undefined && (typeof hazardType !== 'string' || !hazardType.trim())) ||
  typeof headline !== 'string' || !headline.trim() ||
  typeof warningInstructions !== 'string' || !warningInstructions.trim() ||
  !allowedSeverities.includes(severity) ||
  (targetMode !== undefined && !allowedTargetModes.includes(targetMode)) ||
  !Array.isArray(targetAreas) || targetAreas.length === 0 ||
  targetAreas.some((area) => typeof area !== 'string' || !area.trim()) ||
  !Array.isArray(requestedChannels) || requestedChannels.length === 0 ||
  requestedChannels.some((channel) => !allowedChannels.includes(channel)) ||
  !Array.isArray(languages) || languages.length === 0 ||
  languages.some((language) => !allowedLanguages.includes(language))
);

const severityMinimum = (severity) => {
  const key = severity.toUpperCase().replaceAll(' ', '_');
  const configured = Number.parseInt(process.env[`ALERT_MIN_RECIPIENTS_${key}`] || '', 10);
  if (Number.isFinite(configured) && configured >= 0) return configured;
  return { Advisory: 10, Watch: 25, Warning: 50, 'Evacuation Order': 100 }[severity] || 0;
};

const conflictWindowMinutes = () => {
  const value = Number.parseInt(process.env.ALERT_CONFLICT_WINDOW_MINUTES || '60', 10);
  return Number.isFinite(value) && value >= 0 ? value : 60;
};

const normalizeTargetsForMode = (mode, areas) => {
  if (!allowedTargetModes.includes(mode) || !Array.isArray(areas) || !areas.length) return null;
  const canonicalAreas = [...new Set(areas.map(normalizeAreaName))];
  if (canonicalAreas.some((area) => !area)) return null;
  const validAreas = mode === 'District' ? DISTRICTS : RIVER_BASINS;
  return canonicalAreas.every((area) => validAreas.includes(area)) ? canonicalAreas : null;
};

const resolveForAreas = async (areas, options) => {
  const resolved = await resolveTargetRecipients(areas, options);
  if (resolved instanceof Set) {
    return { recipients: [...resolved].map((citizenId) => ({ citizenId })), recipientCount: resolved.size, targetAreas: areas };
  }
  return resolved;
};

const findConflicts = async (targetAreas, exceptAlertId = '') => {
  const since = new Date(Date.now() - conflictWindowMinutes() * 60 * 1000);
  const alerts = await Alert.find({
    status: { $in: activeStatuses },
    targetAreas: { $in: targetAreas },
    issuedAt: { $gte: since },
    ...(exceptAlertId ? { alertId: { $ne: exceptAlertId } } : {}),
  }).select('alertId headline severity targetAreas status issuedAt supersedesAlertId').lean();
  return alerts;
};

const previewAlert = async (req, res) => {
  try {
    const payload = getPayload(req.body);
    const targetAreas = normalizeTargetsForMode(payload.targetMode, payload.targetAreas);
    if (!allowedSeverities.includes(payload.severity) || !targetAreas ||
        !Array.isArray(payload.requestedChannels) || payload.requestedChannels.length === 0 || payload.requestedChannels.some((channel) => !allowedChannels.includes(channel))) {
      return res.status(400).json({ message: 'Select a valid severity, target mode, target area, and delivery channel.' });
    }
    const resolution = await resolveForAreas(targetAreas, { allowEmpty: true });
    const conflicts = await findConflicts(targetAreas, payload.supersedesAlertId || '');
    const recipientCount = resolution.recipientCount;
    return res.status(200).json({
      targetAreas: resolution.targetAreas,
      recipientCount,
      minimumRecipients: severityMinimum(payload.severity),
      belowMinimum: recipientCount > 0 && recipientCount < severityMinimum(payload.severity),
      noRecipients: recipientCount === 0,
      conflicts: conflicts.map(({ alertId, headline, severity, targetAreas: areas, status, issuedAt }) => ({ alertId, headline, severity, targetAreas: areas, status, issuedAt })),
      conflictWindowMinutes: conflictWindowMinutes(),
    });
  } catch (error) {
    if (error instanceof RecipientResolutionError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: 'Unable to build warning preview.' });
  }
};

const persistFailureState = async (alert, error) => {
  try {
    alert.status = 'Failed';
    alert.deliveryLogs = [{
      channel: 'System', status: 'Failed', outcome: 'Failed', attempts: 1,
      reason: error.message || 'Dispatch processing failed.',
      errorDetails: { code: error.code || 'DISPATCH_PROCESSING_FAILURE', message: error.message || 'Dispatch processing failed.' },
      timestamp: new Date(),
    }];
    alert.dispatchedAt = new Date();
    await alert.save();
  } catch (persistenceError) {
    console.error('Unable to persist failed alert state:', persistenceError);
  }
};

const createAlert = async (req, res) => {
  let alert;
  try {
    const payload = getPayload(req.body);
    if (validatePayload(payload)) {
      return res.status(400).json({ message: 'Hazard type, headline, instructions, valid severity, target areas, delivery channels, and languages are required.' });
    }

    let verifiedReportId = null;
    if (payload.sourceReportId) {
      if (!mongoose.isValidObjectId(payload.sourceReportId)) return res.status(400).json({ message: 'The source hazard report is invalid.' });
      const sourceReport = await HazardReport.findById(payload.sourceReportId).select('_id status');
      if (!sourceReport) return res.status(404).json({ message: 'The source hazard report was not found.' });
      if (sourceReport.status !== 'Verified') return res.status(409).json({ message: 'Only verified hazard reports can be used to issue a warning.' });
      verifiedReportId = sourceReport._id;
    }

    let supersedesAlertId = '';
    if (payload.supersedesAlertId) {
      const original = await Alert.findOne({ alertId: payload.supersedesAlertId });
      if (!original || !activeStatuses.includes(original.status)) {
        return res.status(404).json({ message: 'The warning being updated was not found or is no longer active.' });
      }
      supersedesAlertId = original.alertId;
    }

    const targetAreas = normalizeTargetsForMode(payload.targetMode, payload.targetAreas);
    if (!targetAreas) return res.status(400).json({ message: 'Target areas must be valid selections for the chosen targeting mode.' });
    const channels = [...new Set(payload.requestedChannels)];
    const resolution = await resolveForAreas(targetAreas);
    const recipients = resolution.recipients;
    if (!recipients.length) return res.status(400).json({ message: 'No registered recipients match the selected areas. Dispatch was not started.' });

    const minimum = severityMinimum(payload.severity);
    if (recipients.length < minimum && payload.minimumAcknowledged !== true) {
      return res.status(409).json({
        code: 'LOW_RECIPIENT_COUNT',
        message: `Only ${recipients.length} recipients match. The configured minimum for ${payload.severity} is ${minimum}. Review the area or explicitly confirm proceeding.`,
        recipientCount: recipients.length,
        minimumRecipients: minimum,
      });
    }

    const conflicts = await findConflicts(targetAreas, supersedesAlertId);
    if (conflicts.length && payload.conflictAcknowledged !== true) {
      return res.status(409).json({
        code: 'CONFLICTING_WARNING',
        message: 'A recent active warning overlaps one or more selected target areas. Review it and confirm whether this warning should proceed.',
        conflicts: conflicts.map(({ alertId, headline, severity, targetAreas: areas, status, issuedAt }) => ({ alertId, headline, severity, targetAreas: areas, status, issuedAt })),
      });
    }

    alert = await Alert.create({
      alertId: newAlertId(),
      createdBy: req.user.id,
      sourceReportId: verifiedReportId,
      supersedesAlertId,
      hazardType: typeof payload.hazardType === 'string' && payload.hazardType.trim() ? payload.hazardType.trim() : 'General',
      severity: payload.severity,
      headline: payload.headline.trim(),
      instructions: payload.warningInstructions.trim(),
      instruction: payload.warningInstructions.trim(),
      targetMode: payload.targetMode,
      targetAreas,
      selectedDeliveryChannels: channels,
      channels,
      languages: payload.languages,
      recipientCount: recipients.length,
      status: 'Dispatching',
      dispatchStartedAt: new Date(),
    });

    const dispatch = await dispatchAlertChannels({
      warningId: alert.alertId,
      recipients,
      channels,
      severity: payload.severity,
      headline: alert.headline,
      instructions: alert.instructions,
    });
    alert.status = dispatch.status;
    alert.deliveryLogs = dispatch.deliveryLogs;
    alert.dispatchedAt = new Date();
    await alert.save();

    const providerAcceptedUsers = new Set(dispatch.deliveryLogs.flatMap((log) =>
      (log.providerResults || []).filter((item) => item.status === 'Accepted').map((item) => item.userId),
    ));
    return res.status(201).json({
      message: 'Dispatch processed',
      alertId: alert.alertId,
      status: alert.status,
      recipientCount: recipients.length,
      recipientsAcceptedByProvider: providerAcceptedUsers.size,
      deliveryLogs: alert.deliveryLogs,
      alert,
    });
  } catch (error) {
    if (RecipientResolutionError && error instanceof RecipientResolutionError) return res.status(400).json({ message: error.message });
    if (alert) await persistFailureState(alert, error);
    console.error('Alert dispatch failed:', error);
    return res.status(500).json({ message: 'Warning processing failed.', error: error.message });
  }
};

const normalizeDraftFields = (body = {}) => {
  const payload = getPayload(body);
  const targetAreas = Array.isArray(payload.targetAreas) ? [...new Set(payload.targetAreas.filter((area) => typeof area === 'string').map((area) => area.trim()).filter(Boolean))] : [];
  const channels = Array.isArray(payload.requestedChannels) ? [...new Set(payload.requestedChannels.filter((item) => allowedChannels.includes(item)))] : [];
  const languages = Array.isArray(payload.languages) ? [...new Set(payload.languages.filter((item) => allowedLanguages.includes(item)))] : [];
  return {
    hazardType: typeof payload.hazardType === 'string' ? payload.hazardType.trim() : 'General',
    headline: typeof payload.headline === 'string' ? payload.headline.trim() : '',
    instructions: typeof payload.warningInstructions === 'string' ? payload.warningInstructions.trim() : '',
    instruction: typeof payload.warningInstructions === 'string' ? payload.warningInstructions.trim() : '',
    severity: allowedSeverities.includes(payload.severity) ? payload.severity : 'Advisory',
    targetMode: allowedTargetModes.includes(payload.targetMode) ? payload.targetMode : 'District',
    targetAreas,
    channels,
    selectedDeliveryChannels: channels,
    languages,
    sourceReportId: payload.sourceReportId && mongoose.isValidObjectId(payload.sourceReportId) ? payload.sourceReportId : null,
    supersedesAlertId: typeof payload.supersedesAlertId === 'string' ? payload.supersedesAlertId : '',
  };
};

const createDraft = async (req, res) => {
  try {
    const alert = await Alert.create({ alertId: newAlertId(), createdBy: req.user.id, ...normalizeDraftFields(req.body), status: 'Draft' });
    return res.status(201).json({ draft: alert });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to save the warning draft.' });
  }
};

const getDrafts = async (req, res) => {
  const drafts = await Alert.find({ status: 'Draft', createdBy: req.user.id }).sort({ updatedAt: -1 });
  return res.status(200).json({ drafts });
};

const getDraft = async (req, res) => {
  const draft = await Alert.findOne({ alertId: req.params.alertId, status: 'Draft', createdBy: req.user.id });
  if (!draft) return res.status(404).json({ message: 'Draft not found.' });
  return res.status(200).json({ draft });
};

const updateDraft = async (req, res) => {
  const draft = await Alert.findOne({ alertId: req.params.alertId, status: 'Draft', createdBy: req.user.id });
  if (!draft) return res.status(404).json({ message: 'Draft not found.' });
  Object.assign(draft, normalizeDraftFields(req.body));
  await draft.save();
  return res.status(200).json({ draft });
};

const deleteDraft = async (req, res) => {
  const draft = await Alert.findOneAndDelete({ alertId: req.params.alertId, status: 'Draft', createdBy: req.user.id });
  if (!draft) return res.status(404).json({ message: 'Draft not found.' });
  return res.status(200).json({ success: true });
};

const getAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find({ status: { $ne: 'Draft' } }).sort({ issuedAt: -1 });
    return res.status(200).json(alerts);
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getAlert = async (req, res) => {
  const alert = await Alert.findOne({ alertId: req.params.alertId, status: { $ne: 'Draft' } });
  if (!alert) return res.status(404).json({ message: 'Warning not found.' });
  return res.status(200).json({ alert });
};

const getCitizenFeed = async (req, res) => {
  try {
    const feedQuery = { status: { $in: ['Dispatched', 'Partially Dispatched'] } };
    if (req.user?.role !== 'DMC Officer') {
      const user = await User.findById(req.user.id).select('district riverBasins').lean();
      if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
      const areas = [...new Set([user.district, ...(user.riverBasins || [])].filter(Boolean))];
      if (!areas.length) return res.status(200).json({ alerts: [], count: 0 });
      feedQuery.targetAreas = { $in: areas };
    }
    const alerts = await Alert.find(feedQuery).select('alertId hazardType headline instructions instruction severity targetMode targetAreas languages selectedDeliveryChannels channels status supersedesAlertId issuedAt dispatchedAt recipientCount').sort({ issuedAt: -1 });
    return res.status(200).json({ alerts, count: alerts.length });
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getDeliveryDetails = async (req, res) => {
  try {
    const alert = await Alert.findOne({ alertId: req.params.alertId });
    if (!alert) return res.status(404).json({ message: 'Alert not found.' });
    return res.status(200).json({ alertId: alert.alertId, status: alert.status, recipientCount: alert.recipientCount, dispatchStartedAt: alert.dispatchStartedAt, dispatchedAt: alert.dispatchedAt, deliveryLogs: alert.deliveryLogs });
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

module.exports = { previewAlert, createAlert, createDraft, getDrafts, getDraft, updateDraft, deleteDraft, getAlerts, getAlert, getCitizenFeed, getDeliveryDetails };
