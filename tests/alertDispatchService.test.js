const {
  dispatchAlertChannels,
} = require('../src/services/alertDispatchService');

const recipients = new Set(['C001', 'C002']);

test('dispatches selected channels independently and returns Dispatched', async () => {
  const adapters = {
    SMS: jest.fn().mockResolvedValue({ channel: 'SMS', status: 'Success' }),
    Push: jest.fn().mockResolvedValue({ channel: 'Push', status: 'Success' }),
  };

  const result = await dispatchAlertChannels({
    warningId: 'ALT-1',
    recipients,
    channels: ['SMS', 'Push'],
    severity: 'Warning',
    adapters,
  });

  expect(result.status).toBe('Dispatched');
  expect(result.deliveryLogs).toHaveLength(2);
  expect(adapters.Push).toHaveBeenCalled();
});

test('retries a retryable SMS timeout and succeeds', async () => {
  const sms = jest.fn()
    .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'SMS_TIMEOUT' }))
    .mockResolvedValueOnce({ channel: 'SMS', status: 'Success' });

  const result = await dispatchAlertChannels({
    warningId: 'ALT-2',
    recipients,
    channels: ['SMS'],
    severity: 'Warning',
    adapters: { SMS: sms },
    retryPolicy: { maxRetries: 1 },
  });

  expect(result.status).toBe('Dispatched');
  expect(sms).toHaveBeenCalledTimes(2);
  expect(result.deliveryLogs[0].attempts).toBe(2);
});

test('returns Partially Dispatched when one channel fails', async () => {
  const result = await dispatchAlertChannels({
    warningId: 'ALT-3',
    recipients,
    channels: ['SMS', 'Push'],
    severity: 'Warning',
    adapters: {
      SMS: jest.fn().mockRejectedValue(new Error('SMS gateway failure')),
      Push: jest.fn().mockResolvedValue({ channel: 'Push', status: 'Success' }),
    },
    retryPolicy: { maxRetries: 0 },
  });

  expect(result.status).toBe('Partially Dispatched');
  expect(result.deliveryLogs.map((log) => log.status)).toEqual(['Failed', 'Success']);
});

test('returns Failed when all selected channels fail', async () => {
  const result = await dispatchAlertChannels({
    warningId: 'ALT-4',
    recipients,
    channels: ['SMS', 'Push'],
    severity: 'Warning',
    adapters: {
      SMS: jest.fn().mockRejectedValue(new Error('SMS gateway failure')),
      Push: jest.fn().mockRejectedValue(new Error('Push gateway failure')),
    },
    retryPolicy: { maxRetries: 0 },
  });

  expect(result.status).toBe('Failed');
  expect(result.deliveryLogs).toHaveLength(2);
});
