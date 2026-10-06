// Simulates an external Push Notification Service
const dispatchPush = async (alertId, recipients, bypassSilent) => {
    return new Promise((resolve) => {
        console.log(`[Push Adapter] Sending Alert ${alertId}. Bypass Silent: ${bypassSilent}`);
        setTimeout(() => {
            resolve({ channel: 'Push', status: 'Success' });
        }, 500);
    });
};

module.exports = { dispatchPush };