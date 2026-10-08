const Alert = require('../models/Alert');
const { resolveRecipients } = require('../services/recipientResolver');
const { dispatchSMS } = require('../adapters/smsAdapter');
const { dispatchPush } = require('../adapters/pushAdapter');

const allowedSeverities = ['Advisory', 'Watch', 'Warning', 'Evacuation Order'];
const allowedChannels = ['SMS', 'Push'];

const createAlert = async (req, res) => {
    try {
        const { headline, instruction, severity, targetAreas, channels, isDraft } = req.body || {};

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

        const normalizedTargetAreas = [...new Set(targetAreas.map((area) => area.trim()))];
        const normalizedChannels = [...new Set(channels)];
        const recipients = resolveRecipients(normalizedTargetAreas);
        if (recipients.size === 0) {
            return res.status(400).json({ message: 'No citizens registered in selected areas. Dispatch aborted.' });
        }

        const alert = await Alert.create({
            alertId: `ALT-${Date.now()}`,
            severity,
            headline: headline.trim(),
            instruction: instruction.trim(),
            targetAreas: normalizedTargetAreas,
            channels: normalizedChannels,
            status: isDraft ? 'Draft' : 'Dispatching',
        });

        if (isDraft) return res.status(201).json({ message: 'Draft saved', alert });

        const deliveryLogs = [];
        let successfulDeliveries = 0;

        for (const channel of normalizedChannels) {
            try {
                if (channel === 'SMS') {
                    const result = await dispatchSMS(alert.alertId, recipients.size);
                    deliveryLogs.push(result);
                } else if (channel === 'Push') {
                    const bypassSilent = severity === 'Warning' || severity === 'Evacuation Order';
                    const result = await dispatchPush(alert.alertId, recipients.size, bypassSilent);
                    deliveryLogs.push(result);
                }
                successfulDeliveries += 1;
            } catch (error) {
                deliveryLogs.push({
                    channel,
                    status: 'Failed',
                    reason: error.message || 'Delivery adapter failed.',
                });
            }
        }

        alert.status = successfulDeliveries === normalizedChannels.length
            ? 'Dispatched'
            : successfulDeliveries === 0
                ? 'Failed'
                : 'Partially Dispatched';
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
        const alerts = await Alert.find({
            status: { $in: ['Dispatching', 'Dispatched', 'Partially Dispatched'] },
        }).sort({ issuedAt: -1 });
        return res.status(200).json(alerts);
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = { createAlert, getAlerts };