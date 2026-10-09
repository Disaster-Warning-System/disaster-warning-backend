jest.mock('../src/models/Alert', () => ({
  create: jest.fn(),
  find: jest.fn(),
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

test('marks an alert partially dispatched when every selected delivery channel fails', async () => {
  dispatchSMS.mockRejectedValueOnce(new Error('SMS offline'));
  dispatchPush.mockRejectedValueOnce(new Error('Push offline'));

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Partially Dispatched');
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
