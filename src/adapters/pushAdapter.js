const dispatchPush = (alertId, recipientCount, bypassSilent) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ channel: 'Push', status: 'Success' });
    }, 500);
  });
};

module.exports = { dispatchPush };