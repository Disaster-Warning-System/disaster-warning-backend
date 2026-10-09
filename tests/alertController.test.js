jest.mock('../src/models/Alert', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../src/models/HazardReport', () => ({
  findById: jest.fn(),
}));

jest.mock('../src/adapters/smsAdapter', () => ({
  dispatchSMS: jest.fn(),
}));

jest.mock('../src/adapters/pushAdapter', () => ({
  dispatchPush: jest.fn(),
}));

jest.mock('../src/services/recipientResolver', () => ({
  resolveRecipients: jest.fn(),
  RecipientResolutionError: class RecipientResolutionError extends Error {},
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Alert = require('../src/models/Alert');
const HazardReport = require('../src/models/HazardReport');
const { dispatchSMS } = require('../src/adapters/smsAdapter');
const { dispatchPush } = require('../src/adapters/pushAdapter');
const { resolveRecipients } = require('../src/services/recipientResolver');
const alertRoutes = require('../src/routes/alertRoutes');

const app = express();
app.use(express.json());
app.use('/api/alerts', alertRoutes);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const officerToken = jwt.sign({ id: 'officer-1', role: 'DMC Officer' }, process.env.JWT_SECRET);

const payload = {
  headline: 'Flood warning',
  instruction: 'Move to higher ground',
  severity: 'Warning',
  targetAreas: ['Colombo', 'Gampaha'],
  channels: ['SMS', 'Push'],
};

function createAlertEntity(data) {
  return {
    ...data,
    deliveryLogs: [],
    save: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resolveRecipients.mockReturnValue(new Set(['C001', 'C002', 'C003']));
  dispatchSMS.mockResolvedValue({ channel: 'SMS', status: 'Success' });
  dispatchPush.mockResolvedValue({
    channel: 'Push',
    status: 'Success',
    bypassSilent: true,
  });
  Alert.create.mockImplementation(async (data) => createAlertEntity(data));
  HazardReport.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', status: 'Verified' }),
  });
  HazardReport.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', status: 'Verified' }),
  });
});

test('creates and dispatches a validated alert', async () => {
  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Dispatched');
  expect(response.body.alert.deliveryLogs).toEqual([
    { channel: 'SMS', status: 'Success' },
    { channel: 'Push', status: 'Success', bypassSilent: true },
  ]);
  expect(response.body.recipientsReached).toBe(3);
  expect(Alert.create).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'Dispatching' }),
  );
  expect(dispatchSMS).toHaveBeenCalledWith(expect.stringMatching(/^ALT-\d+$/), 3);
  expect(dispatchPush).toHaveBeenCalledWith(
    expect.stringMatching(/^ALT-\d+$/),
    3,
    true,
  );
});

test.each([
  [{ ...payload, headline: undefined }],
  [{ ...payload, headline: '  ' }],
  [{ ...payload, instruction: '' }],
  [{ ...payload, severity: 'Extreme' }],
  [{ ...payload, targetAreas: undefined }],
  [{ ...payload, targetAreas: [] }],
  [{ ...payload, channels: [] }],
  [{ ...payload, channels: ['Email'] }],
])('rejects invalid alert input: %j', async (invalidPayload) => {
  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(invalidPayload);

  expect(response.status).toBe(400);
  expect(Alert.create).not.toHaveBeenCalled();
  expect(resolveRecipients).not.toHaveBeenCalled();
});

test('rejects an alert when no citizens are registered in its target areas', async () => {
  resolveRecipients.mockReturnValue(new Set());

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/No citizens registered/);
  expect(Alert.create).not.toHaveBeenCalled();
});

test('continues to the next adapter when SMS fails and records a partial dispatch', async () => {
  dispatchSMS.mockRejectedValueOnce(new Error('SMS Gateway Timeout'));

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(dispatchPush).toHaveBeenCalled();
  expect(response.body.alert.status).toBe('Partially Dispatched');
  expect(response.body.alert.deliveryLogs).toEqual([
    { channel: 'SMS', status: 'Failed', reason: 'SMS Gateway Timeout' },
    { channel: 'Push', status: 'Success', bypassSilent: true },
  ]);
});

test('marks an alert failed when every selected delivery channel fails', async () => {
  dispatchSMS.mockRejectedValueOnce(new Error('SMS offline'));
  dispatchPush.mockRejectedValueOnce(new Error('Push offline'));

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Failed');
  expect(response.body.alert.deliveryLogs).toHaveLength(2);
});

test('returns sorted non-draft active alerts', async () => {
  const activeAlerts = [{ alertId: 'ALT-active' }];
  const sort = jest.fn().mockResolvedValue(activeAlerts);
  Alert.find.mockReturnValue({ sort });

  const response = await request(app)
    .get('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual(activeAlerts);
  expect(Alert.find).toHaveBeenCalledWith({});
  expect(sort).toHaveBeenCalledWith({ issuedAt: -1 });
});

test('returns a server error when alert persistence fails', async () => {
  Alert.create.mockRejectedValueOnce(new Error('Database unavailable'));

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(500);
  expect(response.body.error).toBe('Database unavailable');
});

test('returns a server error when active alerts cannot be loaded', async () => {
  Alert.find.mockImplementationOnce(() => {
    throw new Error('Database unavailable');
  });

  const response = await request(app)
    .get('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`);

  expect(response.status).toBe(500);
  expect(response.body.error).toBe('Database unavailable');
});

test('returns the citizen feed with only dispatchable alerts', async () => {
  const feed = [{ alertId: 'ALT-feed', status: 'Dispatched' }];
  const sort = jest.fn().mockResolvedValue(feed);
  Alert.find.mockReturnValueOnce({ sort });

  const response = await request(app)
    .get('/api/alerts/feed')
    .set('Authorization', `Bearer ${officerToken}`)

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ alerts: feed, count: 1 });
  expect(Alert.find).toHaveBeenCalledWith({
    status: { $in: ['Dispatched', 'Partially Dispatched'] },
  });
});

test('returns delivery details for an existing alert', async () => {
  const alert = {
    alertId: 'ALT-details',
    status: 'Partially Dispatched',
    recipientCount: 3,
    dispatchStartedAt: new Date('2025-01-01T00:00:00.000Z'),
    dispatchedAt: new Date('2025-01-01T00:01:00.000Z'),
    deliveryLogs: [{ channel: 'SMS', status: 'Failed' }],
  };
  Alert.findOne.mockResolvedValueOnce(alert);

  const response = await request(app)
    .get('/api/alerts/ALT-details/delivery-details')
    .set('Authorization', `Bearer ${officerToken}`)

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    alertId: 'ALT-details',
    status: 'Partially Dispatched',
    recipientCount: 3,
    deliveryLogs: alert.deliveryLogs,
  });
});

test('returns 404 when delivery details do not exist', async () => {
  Alert.findOne.mockResolvedValueOnce(null);

  const response = await request(app)
    .get('/api/alerts/ALT-missing/delivery-details')
    .set('Authorization', `Bearer ${officerToken}`)

  expect(response.status).toBe(404);
  expect(response.body.message).toBe('Alert not found.');
});

test.each([
  [{ ...payload, targetMode: 'Province' }],
  [{ ...payload, channels: ['Email'] }],
  [{ ...payload, channels: undefined }],
  [{ ...payload, targetAreas: ['   '] }],
])('rejects invalid target or channel values: %j', async (invalidPayload) => {
  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(invalidPayload);

  expect(response.status).toBe(400);
  expect(Alert.create).not.toHaveBeenCalled();
  expect(dispatchSMS).not.toHaveBeenCalled();
  expect(dispatchPush).not.toHaveBeenCalled();
});

test('accepts the new field names and normalizes duplicate areas and channels', async () => {
  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send({
      hazardType: 'Flood',
      headline: 'River warning',
      instructions: 'Move to higher ground.',
      severity: 'Watch',
      targetMode: 'River Basin',
      targetAreas: ['Colombo', 'Colombo'],
      selectedDeliveryChannels: ['SMS', 'SMS'],
    });

  expect(response.status).toBe(201);
  expect(Alert.create).toHaveBeenCalledWith(expect.objectContaining({
    targetMode: 'River Basin',
    targetAreas: ['Colombo'],
    selectedDeliveryChannels: ['SMS'],
    instructions: 'Move to higher ground.',
  }));
  expect(dispatchSMS).toHaveBeenCalledTimes(1);
  expect(dispatchPush).not.toHaveBeenCalled();
});

test('retries an SMS timeout and dispatches successfully with Push', async () => {
  const timeout = Object.assign(new Error('SMS timeout'), { code: 'SMS_TIMEOUT' });
  dispatchSMS
    .mockRejectedValueOnce(timeout)
    .mockResolvedValueOnce({ channel: 'SMS', status: 'Success' });

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Dispatched');
  expect(dispatchSMS).toHaveBeenCalledTimes(2);
  expect(dispatchPush).toHaveBeenCalledTimes(1);
  expect(response.body.alert.deliveryLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: 'SMS', status: 'Success', attempts: 2 }),
    expect.objectContaining({ channel: 'Push', status: 'Success' }),
  ]));
});

test('records Push failure while SMS succeeds', async () => {
  dispatchPush.mockRejectedValue(new Error('Push gateway failure'));

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Partially Dispatched');
  expect(dispatchSMS).toHaveBeenCalled();
  expect(dispatchPush).toHaveBeenCalled();
  expect(response.body.alert.deliveryLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: 'SMS', status: 'Success' }),
    expect.objectContaining({ channel: 'Push', status: 'Failed', reason: 'Push gateway failure' }),
  ]));
});

test('marks the alert Failed when every selected channel fails and persists logs', async () => {
  dispatchSMS.mockRejectedValue(new Error('SMS unavailable'));
  dispatchPush.mockRejectedValue(new Error('Push unavailable'));

  const entity = createAlertEntity({});
  Alert.create.mockResolvedValueOnce(entity);
  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Failed');
  expect(entity.save).toHaveBeenCalledTimes(1);
  expect(entity.deliveryLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: 'SMS', status: 'Failed' }),
    expect.objectContaining({ channel: 'Push', status: 'Failed' }),
  ]));
});

test('continues after an unexpected adapter exception and records the failed channel', async () => {
  dispatchSMS.mockRejectedValueOnce(new TypeError('Adapter contract failed'));

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(dispatchPush).toHaveBeenCalled();
  expect(response.body.alert.status).toBe('Partially Dispatched');
  expect(response.body.alert.deliveryLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: 'SMS', status: 'Failed', reason: 'Adapter contract failed' }),
  ]));
});

test('marks a persisted alert Failed when final persistence throws unexpectedly', async () => {
  const entity = createAlertEntity({});
  entity.save.mockRejectedValue(new Error('Database write failed'));
  Alert.create.mockResolvedValueOnce(entity);

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(500);
  expect(response.body.error).toBe('Database write failed');
  expect(entity.status).toBe('Failed');
  expect(entity.deliveryLogs[0]).toEqual(expect.objectContaining({
    channel: 'System',
    status: 'Failed',
    reason: 'Database write failed',
  }));
  expect(entity.save).toHaveBeenCalledTimes(2);
});

test('rejects an invalid source hazard report id before persistence', async () => {
  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send({ ...payload, sourceReportId: 'not-an-object-id' });

  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/source hazard report is invalid/i);
  expect(HazardReport.findById).not.toHaveBeenCalled();
  expect(Alert.create).not.toHaveBeenCalled();
});

test('rejects a missing source hazard report', async () => {
  HazardReport.findById.mockReturnValueOnce({
    select: jest.fn().mockResolvedValue(null),
  });

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send({ ...payload, sourceReportId: '507f1f77bcf86cd799439011' });

  expect(response.status).toBe(404);
  expect(response.body.message).toMatch(/not found/i);
  expect(Alert.create).not.toHaveBeenCalled();
});

test('rejects an unverified source hazard report', async () => {
  HazardReport.findById.mockReturnValueOnce({
    select: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', status: 'Pending' }),
  });

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send({ ...payload, sourceReportId: '507f1f77bcf86cd799439011' });

  expect(response.status).toBe(409);
  expect(response.body.message).toMatch(/verified/i);
  expect(Alert.create).not.toHaveBeenCalled();
});

test('rejects a recipient resolver domain error as HTTP 400', async () => {
  const ResolverError = require('../src/services/recipientResolver').RecipientResolutionError;
  resolveRecipients.mockImplementationOnce(() => {
    throw new ResolverError('Target area lookup failed.');
  });

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(400);
  expect(response.body.message).toBe('Target area lookup failed.');
  expect(Alert.create).not.toHaveBeenCalled();
});

test('returns citizen feed results and handles feed persistence errors', async () => {
  const feed = [{ alertId: 'ALT-feed', status: 'Dispatched' }];
  Alert.find.mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(feed) });

  const success = await request(app)
    .get('/api/alerts/feed')
    .set('Authorization', `Bearer ${officerToken}`);

  expect(success.status).toBe(200);
  expect(success.body).toEqual({ alerts: feed, count: 1 });

  Alert.find.mockImplementationOnce(() => {
    throw new Error('Feed database unavailable');
  });
  const failure = await request(app)
    .get('/api/alerts/feed')
    .set('Authorization', `Bearer ${officerToken}`);

  expect(failure.status).toBe(500);
  expect(failure.body.error).toBe('Feed database unavailable');
});

test('returns delivery details and handles lookup errors', async () => {
  Alert.findOne.mockResolvedValueOnce({
    alertId: 'ALT-details',
    status: 'Dispatched',
    recipientCount: 4,
    dispatchStartedAt: '2026-01-01T00:00:00.000Z',
    dispatchedAt: '2026-01-01T00:01:00.000Z',
    deliveryLogs: [{ channel: 'SMS', status: 'Success' }],
  });
  const success = await request(app)
    .get('/api/alerts/ALT-details/delivery-details')
    .set('Authorization', `Bearer ${officerToken}`);

  expect(success.status).toBe(200);
  expect(success.body).toMatchObject({
    alertId: 'ALT-details',
    status: 'Dispatched',
    recipientCount: 4,
  });

  Alert.findOne.mockRejectedValueOnce(new Error('Delivery lookup failed'));
  const failure = await request(app)
    .get('/api/alerts/ALT-details/delivery-details')
    .set('Authorization', `Bearer ${officerToken}`);

  expect(failure.status).toBe(500);
  expect(failure.body.error).toBe('Delivery lookup failed');
});

test('protects warning endpoints from missing, invalid, and unauthorized roles', async () => {
  const missing = await request(app).get('/api/alerts/feed');
  expect(missing.status).toBe(401);

  const invalid = await request(app)
    .get('/api/alerts/feed')
    .set('Authorization', 'Bearer invalid-token');
  expect(invalid.status).toBe(401);

  const otherRole = jwt.sign({ id: 'citizen-1', role: 'Citizen' }, process.env.JWT_SECRET);
  const forbidden = await request(app)
    .get('/api/alerts/feed')
    .set('Authorization', `Bearer ${otherRole}`);
  expect(forbidden.status).toBe(403);
});
