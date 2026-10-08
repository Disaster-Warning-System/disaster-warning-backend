const Alert = require('../models/Alert');
const { resolveRecipients } = require('../services/recipientResolver');
const { dispatchSMS } = require('../adapters/smsAdapter');
const { dispatchPush } = require('../adapters/pushAdapter');

const createAlert = async (req, res) => {
    try {
        const { headline, instruction, severity, targetAreas, channels, isDraft } = req.body;

        if (
            !headline ||
            !instruction ||
            !Array.isArray(targetAreas) ||
            targetAreas.length === 0
        ) {
            return res.status(400).json({ message: 'Missing mandatory fields or target areas.' });
        }

        const recipients = resolveRecipients(targetAreas);
        if (recipients.size === 0) {
            return res.status(400).json({ message: 'No citizens registered in selected areas. Dispatch aborted.' });
        }

        let alert = await Alert.create({
            alertId: `ALT-${Date.now()}`,
            severity, headline, instruction, targetAreas, channels,
            status: isDraft ? 'Draft' : 'Dispatching'
        });

        if (isDraft) return res.status(201).json({ message: 'Draft saved', alert });

        const deliveryLogs = [];
        let hasFailures = false;

        for (const channel of channels) {
            try {
                if (channel === 'SMS') {
                    const result = await dispatchSMS(alert.alertId, recipients.size);
                    deliveryLogs.push(result);
                } else if (channel === 'Push') {
                    const bypassSilent = severity === 'Warning' || severity === 'Evacuation Order';
                    const result = await dispatchPush(alert.alertId, recipients.size, bypassSilent);
                    deliveryLogs.push(result);
                }
            } catch (error) {
                deliveryLogs.push({ channel, status: 'Failed', reason: error.message });
                hasFailures = true;
            }
        }

        alert.status = hasFailures ? 'Partially Dispatched' : 'Dispatched';
        alert.deliveryLogs = deliveryLogs;
        await alert.save();

        res.status(201).json({ message: 'Dispatch complete', alert, recipientsReached: recipients.size });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

const getAlerts = async (req, res) => {
    try {
        const alerts = await Alert.find({ status: { $ne: 'Draft' } }).sort({ issuedAt: -1 });
        res.status(200).json(alerts);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = { createAlert, getAlerts };