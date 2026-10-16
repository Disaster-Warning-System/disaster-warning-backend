const { SMSChannelAdapter } = require('../src/adapters/smsAdapter');
const { PushChannelAdapter } = require('../src/adapters/pushAdapter');
const { EmailChannelAdapter } = require('../src/adapters/emailAdapter');

const smsEnv = { BREVO_API_KEY: 'test-brevo-key', BREVO_SMS_SENDER: 'DMSAlert' };

test('Brevo SMS sends each registered phone with transactional content and records acceptance', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ messageId: 123456 }) });
  const adapter = new SMSChannelAdapter({ fetchImpl, env: smsEnv });
  const result = await adapter.sendWarning({
    warningId: 'ALT-1', headline: 'Flood warning', instructions: 'Move to higher ground', recipients: [
      { citizenId: 'u1', phoneNumber: '+94770000001' },
      { citizenId: 'u2', phoneNumber: '' },
    ],
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://api.brevo.com/v3/transactionalSMS/send');
  expect(options.headers['api-key']).toBe('test-brevo-key');
  expect(JSON.parse(options.body)).toMatchObject({
    sender: 'DMSAlert', recipient: '+94770000001', type: 'transactional', tag: 'ALT-1',
  });
  expect(JSON.parse(options.body).content).toContain('Move to higher ground');
  expect(result).toMatchObject({ status: 'Partially Accepted', acceptedCount: 1, failedCount: 1, eligibleCount: 2 });
  expect(result.providerResults).toEqual(expect.arrayContaining([
    expect.objectContaining({ userId: 'u1', status: 'Accepted', providerId: '123456' }),
    expect.objectContaining({ userId: 'u2', status: 'Failed', code: 'PHONE_NUMBER_MISSING' }),
  ]));
});

test('Brevo adapter records provider rejection and does not claim success', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: 'Unavailable', code: 'service_unavailable' }) });
  const result = await new SMSChannelAdapter({ fetchImpl, env: smsEnv }).sendWarning({
    warningId: 'ALT-2', headline: 'Alert', instructions: 'Act', recipients: [{ citizenId: 'u1', phoneNumber: '+94770000001' }],
  });
  expect(result.status).toBe('Failed');
  expect(result.providerResults[0]).toMatchObject({ status: 'Failed', error: 'Unavailable', code: 'service_unavailable' });
});

test('SMS adapter reports missing Brevo configuration', async () => {
  await expect(new SMSChannelAdapter({ fetchImpl: jest.fn(), env: {} }).sendWarning({
    warningId: 'ALT-3', headline: 'Alert', instructions: 'Act', recipients: [],
  })).rejects.toMatchObject({ code: 'SMS_NOT_CONFIGURED' });
});

test('Brevo adapter reports provider acceptance only when a message ID is returned', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
  const result = await new SMSChannelAdapter({ fetchImpl, env: smsEnv }).sendWarning({
    warningId: 'ALT-7', headline: 'Alert', instructions: 'Act', recipients: [{ citizenId: 'u1', phoneNumber: '+94770000001' }],
  });
  expect(result.status).toBe('Failed');
  expect(result.providerResults[0]).toMatchObject({ status: 'Failed', code: 'BREVO_INVALID_RESPONSE' });
});

test('Text.lk demo provider uses its API contract and records the returned message reference', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({
    status: 'success', data: { uid: 'textlk-123', status: 'Delivered' },
  }) });
  const adapter = new SMSChannelAdapter({ fetchImpl, env: {
    SMS_PROVIDER: 'textlk', TEXTLK_API_KEY: 'test-textlk-key', TEXTLK_SENDER_ID: 'TextLKDemo',
  } });
  const result = await adapter.sendWarning({
    warningId: 'ALT-8', headline: 'Test warning', instructions: 'Demo message',
    recipients: [{ citizenId: 'u1', phoneNumber: '+94770000001' }],
  });

  expect(fetchImpl).toHaveBeenCalledWith('https://app.text.lk/api/v3/sms/send', expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ Authorization: 'Bearer test-textlk-key' }),
  }));
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
    recipient: '94770000001', sender_id: 'TextLKDemo', type: 'plain', message: 'Test warning\n\nDemo message',
  });
  expect(result).toMatchObject({
    status: 'Accepted', outcome: 'Accepted by Text.lk', acceptedCount: 1, attemptedCount: 1,
  });
  expect(result.providerResults[0]).toMatchObject({ userId: 'u1', providerId: 'textlk-123', status: 'Accepted' });
});

test('Text.lk reports missing API configuration instead of attempting delivery', async () => {
  const fetchImpl = jest.fn();
  await expect(new SMSChannelAdapter({ fetchImpl, env: {
    SMS_PROVIDER: 'textlk', TEXTLK_SENDER_ID: 'TextLKDemo',
  } }).sendWarning({
    warningId: 'ALT-9', headline: 'Warning', instructions: 'Act', recipients: [],
  })).rejects.toMatchObject({ code: 'SMS_NOT_CONFIGURED' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('Brevo email sends a separate warning email per registered recipient', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ messageId: '<email-123@brevo>' }),
  });
  const adapter = new EmailChannelAdapter({ fetchImpl, env: {
    BREVO_API_KEY: 'test-brevo-key',
    BREVO_EMAIL_SENDER: 'alerts@example.org',
    BREVO_EMAIL_SENDER_NAME: 'DMC Alerts',
  } });
  const result = await adapter.sendWarning({
    warningId: 'ALT-email-1',
    headline: 'Flood warning',
    instructions: 'Move to higher ground.',
    severity: 'Warning',
    targetAreas: ['Colombo'],
    recipients: [{ citizenId: 'u1', name: 'Citizen One', email: 'one@example.lk' }],
  });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://api.brevo.com/v3/smtp/email');
  expect(options.headers['api-key']).toBe('test-brevo-key');
  expect(JSON.parse(options.body)).toMatchObject({
    sender: { email: 'alerts@example.org', name: 'DMC Alerts' },
    to: [{ email: 'one@example.lk', name: 'Citizen One' }],
    subject: '[Warning] Flood warning',
    tags: ['ALT-email-1'],
  });
  expect(JSON.parse(options.body).textContent).toContain('Affected areas: Colombo');
  expect(result).toMatchObject({ channel: 'Email', status: 'Accepted', acceptedCount: 1, attemptedCount: 1 });
  expect(result.providerResults[0]).toMatchObject({ userId: 'u1', providerId: '<email-123@brevo>', status: 'Accepted' });
});

test('Brevo email logs missing recipient addresses without calling the provider', async () => {
  const fetchImpl = jest.fn();
  const result = await new EmailChannelAdapter({ fetchImpl, env: {
    BREVO_API_KEY: 'test-brevo-key', BREVO_EMAIL_SENDER: 'alerts@example.org',
  } }).sendWarning({
    warningId: 'ALT-email-2', headline: 'Warning', instructions: 'Take action', severity: 'Watch',
    recipients: [{ citizenId: 'u1', email: '' }],
  });

  expect(fetchImpl).not.toHaveBeenCalled();
  expect(result).toMatchObject({ status: 'Failed', attemptedCount: 0, failedCount: 1 });
  expect(result.providerResults[0]).toMatchObject({ code: 'EMAIL_ADDRESS_MISSING', status: 'Failed' });
});

test('Brevo email reports missing configuration without attempting delivery', async () => {
  const fetchImpl = jest.fn();
  await expect(new EmailChannelAdapter({ fetchImpl, env: {} }).sendWarning({
    warningId: 'ALT-email-3', headline: 'Warning', instructions: 'Take action', severity: 'Watch',
    recipients: [{ citizenId: 'u1', email: 'one@example.lk' }],
  })).rejects.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('Expo Push submits registered device tokens and stores tickets without raw tokens', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }) });
  const result = await new PushChannelAdapter({ fetchImpl, env: {} }).sendWarning({
    warningId: 'ALT-4', headline: 'Flood', instructions: 'Evacuate', severity: 'Evacuation Order', recipients: [
      { citizenId: 'u1', pushTokens: ['ExpoPushToken[device]'] },
    ],
  });
  const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
  expect(sent[0]).toMatchObject({ to: 'ExpoPushToken[device]', title: 'Flood', body: 'Evacuate', priority: 'high' });
  expect(result).toMatchObject({ status: 'Accepted', acceptedCount: 1, failedCount: 0 });
  expect(result.providerResults[0]).toMatchObject({ userId: 'u1', status: 'Accepted', providerId: 'ticket-1' });
  expect(result.providerResults[0]).not.toHaveProperty('token');
});

test('Expo Push marks recipients with no registered tokens as failed', async () => {
  const fetchImpl = jest.fn();
  const result = await new PushChannelAdapter({ fetchImpl, env: {} }).sendWarning({
    warningId: 'ALT-5', headline: 'Flood', instructions: 'Evacuate', severity: 'Warning', recipients: [{ citizenId: 'u1', pushTokens: [] }],
  });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(result).toMatchObject({ status: 'Failed', acceptedCount: 0, failedCount: 1 });
  expect(result.providerResults[0].code).toBe('PUSH_TOKEN_MISSING');
});

test('Expo Push records service and per-ticket failures', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'error', message: 'Device is not registered.', details: { error: 'DeviceNotRegistered' } }] }) });
  const result = await new PushChannelAdapter({ fetchImpl, env: {} }).sendWarning({
    warningId: 'ALT-6', headline: 'Flood', instructions: 'Evacuate', severity: 'Warning', recipients: [{ citizenId: 'u1', pushTokens: ['ExpoPushToken[dead]'] }],
  });
  expect(result.status).toBe('Failed');
  expect(result.providerResults[0]).toMatchObject({ status: 'Failed', code: 'DeviceNotRegistered' });
});
