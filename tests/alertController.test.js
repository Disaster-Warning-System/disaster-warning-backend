jest.mock('../src/models/Alert', () => ({
  create: jest.fn(),
  find: jest.fn(),
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
const Alert = require('../src/models/Alert');
const { dispatchSMS } = require('../src/adapters/smsAdapter');
const { dispatchPush } = require('../src/adapters/pushAdapter');
const { resolveRecipients } = require('../src/services/recipientResolver');
const alertRoutes = require('../src/routes/alertRoutes');

const app = express();
app.use(express.json());
app.use('/api/alerts', alertRoutes);

const payload = {
  headline: 'Flood warning',
  instruction: 'Move to higher ground',
  severity: 'Warning',
  targetAreas: ['Colombo', 'Gampaha'],
  channels: ['SMS', 'Push'],
};

function mockCreatedAlert(data = payload) {
  return {
    alertId: 'ALT-test',
    ...data,
    status: 'Dispatching',
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
  Alert.create.mockImplementation(async (data) => mockCreatedAlert(data));
});

test('successfully creates and dispatches an alert', async () => {
  const response = await request(app).post('/api/alerts').send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Dispatched');
  expect(response.body.alert.deliveryLogs).toEqual([
    { channel: 'SMS', status: 'Success' },
    { channel: 'Push', status: 'Success', bypassSilent: true },
  ]);
  expect(response.body.recipientsReached).toBe(3);
  expect(resolveRecipients).toHaveBeenCalledWith(payload.targetAreas);
  expect(dispatchSMS).toHaveBeenCalledWith(expect.stringMatching(/^ALT-\d+$/), 3);
  expect(dispatchPush).toHaveBeenCalledWith(expect.stringMatching(/^ALT-\d+$/), 3, true);
});

test('returns 400 when the headline is missing', async () => {
  const response = await request(app)
    .post('/api/alerts')
    .send({ ...payload, headline: '' });

  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/Missing mandatory fields/);
  expect(resolveRecipients).not.toHaveBeenCalled();
  expect(Alert.create).not.toHaveBeenCalled();
});

test('returns 400 when no recipients are resolved', async () => {
  resolveRecipients.mockReturnValue(new Set());

  const response = await request(app).post('/api/alerts').send(payload);

  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/No citizens registered/);
  expect(Alert.create).not.toHaveBeenCalled();
});

test('continues dispatching after SMS failure and marks the alert partially dispatched', async () => {
  dispatchSMS.mockRejectedValueOnce(new Error('SMS Gateway Timeout'));

  const response = await request(app).post('/api/alerts').send(payload);

  expect(response.status).toBe(201);
  expect(dispatchSMS).toHaveBeenCalled();
  expect(dispatchPush).toHaveBeenCalled();
  expect(response.body.alert.status).toBe('Partially Dispatched');
  expect(response.body.alert.deliveryLogs).toEqual([
    { channel: 'SMS', status: 'Failed', reason: 'SMS Gateway Timeout' },
    { channel: 'Push', status: 'Success', bypassSilent: true },
  ]);
});
