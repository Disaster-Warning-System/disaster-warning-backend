// Simulates an external SMS Gateway
const dispatchSMS = async (alertId, recipients) => {
    return new Promise((resolve, reject) => {
        console.log(`[SMS Adapter] Sending Alert ${alertId} to ${recipients.size} citizens...`);
        // Simulate network delay and a 95% success rate
        setTimeout(() => {
            const isSuccess = Math.random() > 0.05;
            if (isSuccess) resolve({ channel: 'SMS', status: 'Success' });
            else reject(new Error('SMS Gateway Timeout'));
        }, 800);
    });
};

module.exports = { dispatchSMS };