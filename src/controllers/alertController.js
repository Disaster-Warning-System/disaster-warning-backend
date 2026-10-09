const Alert = require('../models/Alert');
const mongoose = require('mongoose');
const HazardReport = require('../models/HazardReport');
const {
    RecipientResolutionError,
    resolveRecipients,
} = require('../services/recipientResolver');
const { dispatchAlertChannels } = require('../services/alertDispatchService');

const allowedSeverities = ['Advisory', 'Watch', 'Warning', 'Evacuation Order'];
const allowedChannels = ['SMS', 'Push'];
const allowedTargetModes = ['District', 'River Basin'];

const getPayload = (body = {}) => ({
    ...body,
    requestedChannels: body.selectedDeliveryChannels || body.channels,
    warningInstructions: body.instructions || body.instruction,
});

const validatePayload = ({
    hazardType,
    headline,
    warningInstructions,
    severity,
    targetMode,
    targetAreas,
    requestedChannels,
}) => (
    (hazardType !== undefined && (typeof hazardType !== 'string' || !hazardType.trim())) ||
    typeof headline !== 'string' ||
    !headline.trim() ||
    typeof warningInstructions !== 'string' ||
    !warningInstructions.trim() ||
    !allowedSeverities.includes(severity) ||
    (targetMode !== undefined && !allowedTargetModes.includes(targetMode)) ||
    !Array.isArray(targetAreas) ||
    targetAreas.length === 0 ||
    targetAreas.some((area) => typeof area !== 'string' || !area.trim()) ||
    !Array.isArray(requestedChannels) ||
    requestedChannels.length === 0 ||
    requestedChannels.some((channel) => !allowedChannels.includes(channel))
);

const persistFailureState = async (alert, error) => {
    try {
        alert.status = 'Failed';
        alert.deliveryLogs = [{
            channel: 'System',
            status: 'Failed',
            outcome: 'Failed',
            attempts: 1,
            reason: error.message || 'Dispatch processing failed.',
            errorDetails: {
                code: error.code || 'DISPATCH_PROCESSING_FAILURE',
                message: error.message || 'Dispatch processing failed.',
                recovery: 'Alert marked Failed after an unexpected processing error.',
            },
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
            return res.status(400).json({
                message: 'Hazard type, headline, instructions, valid severity, target areas, and delivery channels are required.',
            });
        }

        let verifiedReportId = null;
        if (payload.sourceReportId !== undefined && payload.sourceReportId !== null && payload.sourceReportId !== '') {
            if (!mongoose.isValidObjectId(payload.sourceReportId)) {
                return res.status(400).json({ message: 'The source hazard report is invalid.' });
            }
            const sourceReport = await HazardReport.findById(payload.sourceReportId).select('_id status');
            if (!sourceReport) {
                return res.status(404).json({ message: 'The source hazard report was not found.' });
            }
            if (sourceReport.status !== 'Verified') {
                return res.status(409).json({
                    message: 'Only verified hazard reports can be used to issue a warning.',
                });
            }
            verifiedReportId = sourceReport._id;
        }

        const normalizedTargetAreas = [...new Set(payload.targetAreas.map((area) => area.trim()))];
        const normalizedChannels = [...new Set(payload.requestedChannels)];
        const resolvedRecipients = resolveRecipients(normalizedTargetAreas);
        const recipients = resolvedRecipients instanceof Set
            ? resolvedRecipients
            : new Set(resolvedRecipients.recipients.map((recipient) => recipient.citizenId));
        if (recipients.size === 0) {
            return res.status(400).json({ message: 'No citizens registered in selected areas. Dispatch aborted.' });
        }

        alert = await Alert.create({
            alertId: `ALT-${Date.now()}`,
            sourceReportId: verifiedReportId,
            hazardType: typeof payload.hazardType === 'string' && payload.hazardType.trim()
                ? payload.hazardType.trim()
                : 'General',
            severity: payload.severity,
            headline: payload.headline.trim(),
            instructions: payload.warningInstructions.trim(),
            instruction: payload.warningInstructions.trim(),
            targetMode: payload.targetMode || 'District',
            targetAreas: normalizedTargetAreas,
            selectedDeliveryChannels: normalizedChannels,
            channels: normalizedChannels,
            recipientCount: recipients.size,
            status: 'Dispatching',
            dispatchStartedAt: new Date(),
        });

        const dispatch = await dispatchAlertChannels({
            warningId: alert.alertId,
            recipients,
            channels: normalizedChannels,
            severity: payload.severity,
        });
        alert.status = dispatch.status;
        alert.deliveryLogs = dispatch.deliveryLogs;
        alert.dispatchedAt = new Date();
        await alert.save();

        return res.status(201).json({
            message: 'Dispatch processed',
            alertId: alert.alertId,
            status: alert.status,
            recipientCount: recipients.size,
            recipientsReached: recipients.size,
            deliveryLogs: alert.deliveryLogs,
            alert,
        });
    } catch (error) {
        if (RecipientResolutionError && error instanceof RecipientResolutionError) {
            return res.status(400).json({ message: error.message });
        }
        if (alert) {
            await persistFailureState(alert, error);
        }
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

const getAlerts = async (req, res) => {
    try {
        const alerts = await Alert.find({}).sort({ issuedAt: -1 });
        return res.status(200).json(alerts);
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

const getCitizenFeed = async (req, res) => {
    try {
        const alerts = await Alert.find({
            status: { $in: ['Dispatched', 'Partially Dispatched'] },
        }).sort({ issuedAt: -1 });
        return res.status(200).json({ alerts, count: alerts.length });
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

const getDeliveryDetails = async (req, res) => {
    try {
        const alert = await Alert.findOne({ alertId: req.params.alertId });
        if (!alert) {
            return res.status(404).json({ message: 'Alert not found.' });
        }
        return res.status(200).json({
            alertId: alert.alertId,
            status: alert.status,
            recipientCount: alert.recipientCount,
            dispatchStartedAt: alert.dispatchStartedAt,
            dispatchedAt: alert.dispatchedAt,
            deliveryLogs: alert.deliveryLogs,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = {
    createAlert,
    getAlerts,
    getCitizenFeed,
    getDeliveryDetails,
};
