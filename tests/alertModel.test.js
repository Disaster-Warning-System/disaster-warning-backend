const Alert = require('../src/models/Alert');

describe('Alert delivery log validation', () => {
  test('validates and normalizes channel outcomes with the installed Mongoose version', async () => {
    const alert = new Alert({
      alertId: 'ALT-model-validation',
      severity: 'Warning',
      headline: 'Flood warning',
      instructions: 'Move to higher ground.',
      instruction: 'Move to higher ground.',
      status: 'Dispatched',
      deliveryLogs: [
        { channel: 'SMS', status: 'Accepted' },
        { channel: 'Push', status: 'Failed', reason: 'Provider unavailable' },
      ],
    });

    await expect(alert.validate()).resolves.toBeUndefined();
    expect(alert.deliveryLogs.map(({ channel, status, outcome, errorDetails }) => ({
      channel, status, outcome, errorDetails,
    }))).toEqual([
      { channel: 'SMS', status: 'Accepted', outcome: 'Accepted', errorDetails: '' },
      { channel: 'Push', status: 'Failed', outcome: 'Failed', errorDetails: 'Provider unavailable' },
    ]);
  });
});
