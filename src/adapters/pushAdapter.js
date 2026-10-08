// Simulates an external Push Notification Service
const dispatchPush = (alertId, recipientCount, bypassSilent) => {
    return new Promise((resolve) => {
        console.log(`[Push Adapter] Sending Alert ${alertId} to ${recipientCount} citizens. Bypass Silent: ${bypassSilent}`);
        setTimeout(() => {
            resolve({ channel: 'Push', status: 'Success', bypassSilent });
        }, 500);
    });
};

module.exports = { dispatchPush };