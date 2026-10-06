const Alert = require('../models/Alert');
const { resolveRecipients } = require('../services/recipientResolver');
const { dispatchSMS } = require('../adapters/smsAdapter');
const { dispatchPush } = require('../adapters/pushAdapter');

const SEVERITIES = ['Advisory', 'Watch', 'Warning', 'Evacuation Order'];
const CHANNELS = ['SMS', 'Push'];

const createAlert = async (req, res) => {
    try {
        const { headline, instruction, severity, districts, channels } = req.body;

        if (
            typeof headline !== 'string' ||
            !headline.trim() ||
            typeof instruction !== 'string' ||
            !instruction.trim() ||
            !Array.isArray(districts) ||
            districts.length === 0 ||
            !Array.isArray(channels) ||
            channels.length === 0 ||
            !SEVERITIES.includes(severity) ||
            channels.some((channel) => !CHANNELS.includes(channel))
        ) {
            return res.status(400).json({
                message:
                    'Headline, instruction, severity, at least one district, and at least one valid channel are required.',
            });
        }

        const recipientSet = resolveRecipients(districts);
        if (recipientSet.size === 0) {
            return res.status(400).json({ message: 'No registered recipients found in the selected areas. Dispatch aborted.' });
        }

        let alert = await Alert.create({
            alertId: `ALT-${Date.now()}`,
            severity,
            headline: headline.trim(),
            instruction: instruction.trim(),
            districts,
            channels,
            status: 'Dispatching',
        });

        const deliveryLogs = [];
        let successes = 0;

        for (const channel of channels) {
            try {
                let result;
                if (channel === 'SMS') {
                    result = await dispatchSMS(alert.alertId, recipientSet);
                } else if (channel === 'Push') {
                    const bypassSilent = severity === 'Warning' || severity === 'Evacuation Order';
                    result = await dispatchPush(alert.alertId, recipientSet, bypassSilent);
                }
                deliveryLogs.push({ ...result, recipients: recipientSet.size });
                successes += 1;
            } catch (error) {
                console.error(`[Dispatch Error] ${channel}: ${error.message}`);
                deliveryLogs.push({
                    channel,
                    status: 'Failed',
                    recipients: 0,
                    reason: error.message,
                });
            }
        }

        alert.deliveryLogs = deliveryLogs;
        alert.status =
            successes === channels.length
                ? 'Dispatched'
                : successes > 0
                  ? 'Partially Dispatched'
                  : 'Failed';
        await alert.save();

        res.status(201).json({
            message: 'Dispatch sequence completed',
            alert,
            recipientsReached: recipientSet.size,
            deliveryLogs
        });

    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

const getAlerts = async (req, res) => {
    try {
        const alerts = await Alert.find({ status: 'Dispatched' }).sort({ createdAt: -1 });
        res.status(200).json(alerts);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = { createAlert, getAlerts };