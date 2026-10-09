const Alert = require('../models/Alert');
const mongoose = require('mongoose');
const HazardReport = require('../models/HazardReport');
const { resolveRecipients } = require('../services/recipientResolver');
const { dispatchSMS } = require('../adapters/smsAdapter');
const { dispatchPush } = require('../adapters/pushAdapter');

const allowedSeverities = ['Advisory', 'Watch', 'Warning', 'Evacuation Order'];
const allowedChannels = ['SMS', 'Push'];

const createAlert = async (req, res) => {
    try {
        const { headline, instruction, severity, targetAreas, channels, sourceReportId } = req.body || {};

        if (
            typeof headline !== 'string' ||
            !headline.trim() ||
            typeof instruction !== 'string' ||
            !instruction.trim() ||
            !allowedSeverities.includes(severity) ||
            !Array.isArray(targetAreas) ||
            targetAreas.length === 0 ||
            targetAreas.some((area) => typeof area !== 'string' || !area.trim()) ||
            !Array.isArray(channels) ||
            channels.length === 0 ||
            channels.some((channel) => !allowedChannels.includes(channel))
        ) {
            return res.status(400).json({
                message: 'Headline, instruction, valid severity, target areas, and delivery channels are required.',
            });
        }

        let verifiedReportId = null;
        if (sourceReportId !== undefined && sourceReportId !== null && sourceReportId !== '') {
            if (!mongoose.isValidObjectId(sourceReportId)) {
                return res.status(400).json({ message: 'The source hazard report is invalid.' });
            }

            const sourceReport = await HazardReport.findById(sourceReportId).select('_id status');
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

        const normalizedTargetAreas = [...new Set(targetAreas.map((area) => area.trim()))];
        const normalizedChannels = [...new Set(channels)];
        const recipients = resolveRecipients(normalizedTargetAreas);
        if (recipients.size === 0) {
            return res.status(400).json({ message: 'No citizens registered in selected areas. Dispatch aborted.' });
        }

        const alert = await Alert.create({
            alertId: `ALT-${Date.now()}`,
            sourceReportId: verifiedReportId,
            severity,
            headline: headline.trim(),
            instruction: instruction.trim(),
            targetAreas: normalizedTargetAreas,
            channels: normalizedChannels,
            status: 'Dispatching',
        });

        const deliveryLogs = [];
        let hasFailures = false;

        for (const channel of normalizedChannels) {
            if (channel === 'SMS') {
                try {
                    const result = await dispatchSMS(alert.alertId, recipients.size);
                    deliveryLogs.push(result);
                } catch (error) {
                    deliveryLogs.push({
                        channel,
                        status: 'Failed',
                        reason: error.message || 'SMS delivery failed.',
                    });
                    hasFailures = true;
                }
            } else if (channel === 'Push') {
                try {
                    const bypassSilent = severity === 'Warning' || severity === 'Evacuation Order';
                    const result = await dispatchPush(alert.alertId, recipients.size, bypassSilent);
                    deliveryLogs.push(result);
                } catch (error) {
                    deliveryLogs.push({
                        channel,
                        status: 'Failed',
                        reason: error.message || 'Push delivery failed.',
                    });
                    hasFailures = true;
                }
            }
        }

        alert.status = hasFailures ? 'Partially Dispatched' : 'Dispatched';
        alert.deliveryLogs = deliveryLogs;
        await alert.save();

        return res.status(201).json({
            message: 'Dispatch complete',
            alert,
            recipientsReached: recipients.size,
        });
    } catch (error) {
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

module.exports = { createAlert, getAlerts };