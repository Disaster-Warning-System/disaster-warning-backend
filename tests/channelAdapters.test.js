const { SMSChannelAdapter } = require('../src/adapters/smsAdapter');
const { PushChannelAdapter } = require('../src/adapters/pushAdapter');

const recipients = new Set(['C001', 'C002']);

test('SMS adapter resolves a structured success result', async () => {
  const result = await new SMSChannelAdapter({
    latencyMs: 1,
    mode: 'success',
  }).sendWarning({ warningId: 'ALT-1', recipients });

  expect(result).toEqual(expect.objectContaining({
    channel: 'SMS',
    status: 'Success',
    outcome: 'Success',
    warningId: 'ALT-1',
    recipientCount: 2,
  }));
});

test('SMS adapter exposes a deterministic timeout failure', async () => {
  await expect(new SMSChannelAdapter({
    latencyMs: 1,
    mode: 'timeout',
  }).sendWarning({ warningId: 'ALT-2', recipients })).rejects.toMatchObject({
    channel: 'SMS',
    code: 'SMS_TIMEOUT',
    status: 'Failed',
  });
});

test('Push adapter exposes a deterministic gateway failure', async () => {
  await expect(new PushChannelAdapter({
    latencyMs: 1,
    mode: 'failure',
  }).sendWarning({ warningId: 'ALT-3', recipients })).rejects.toMatchObject({
    channel: 'Push',
    code: 'PUSH_GATEWAY_FAILURE',
    status: 'Failed',
  });
});

test('Push adapter resolves independently when SMS fails', async () => {
  const smsPromise = new SMSChannelAdapter({ latencyMs: 1, mode: 'timeout' })
    .sendWarning({ warningId: 'ALT-4', recipients });
  const pushPromise = new PushChannelAdapter({ latencyMs: 1, mode: 'success' })
    .sendWarning({ warningId: 'ALT-4', recipients });

  await expect(smsPromise).rejects.toMatchObject({ code: 'SMS_TIMEOUT' });
  await expect(pushPromise).resolves.toEqual(expect.objectContaining({
    channel: 'Push',
    status: 'Success',
  }));
});
