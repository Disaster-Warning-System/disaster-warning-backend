const dispatchSMS = (alertId, recipientCount) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.05) {
        reject(new Error('SMS Gateway Timeout'));
        return;
      }

      resolve({ channel: 'SMS', status: 'Success' });
    }, 800);
  });
};

module.exports = { dispatchSMS };