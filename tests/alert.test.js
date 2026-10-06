jest.mock('../src/models/Alert', () => {
  const Alert = jest.fn();
  Alert.create = jest.fn();
  Alert.find = jest.fn();
  return Alert;
});

jest.mock('../src/adapters/smsAdapter', () => ({
  dispatchSMS: jest.fn(),
}));

jest.mock('../src/adapters/pushAdapter', () => ({
  dispatchPush: jest.fn(),
}));

const request = require('supertest');
const { app } = require('../src/server');
const Alert = require('../src/models/Alert');
const { dispatchSMS } = require('../src/adapters/smsAdapter');
const { dispatchPush } = require('../src/adapters/pushAdapter');

const payload = {
  headline: 'Flood warning',
  instruction: 'Move to higher ground',
  severity: 'Warning',
  districts: ['Colombo', 'Gampaha'],
  channels: ['SMS', 'Push'],
};

function createdAlert() {
  return {
    alertId: 'ALT-test',
    ...payload,
    status: 'Dispatching',
    deliveryLogs: [],
    save: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  Alert.create.mockImplementation(async (data) => ({ ...data, save: jest.fn().mockResolvedValue(undefined) }));
  dispatchSMS.mockResolvedValue({ channel: 'SMS', status: 'Success' });
  dispatchPush.mockResolvedValue({ channel: 'Push', status: 'Success' });
});

test('creates and dispatches an alert with delivery logs', async () => {
  const response = await request(app).post('/api/alerts').send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Dispatched');
  expect(response.body.deliveryLogs).toHaveLength(2);
  expect(response.body.recipientsReached).toBe(4);
});

test('rejects missing required fields', async () => {
  const response = await request(app).post('/api/alerts').send({ ...payload, headline: '' });

  expect(response.status).toBe(400);
  expect(Alert.create).not.toHaveBeenCalled();
});

test('aborts when no registered recipients exist', async () => {
  const response = await request(app)
    .post('/api/alerts')
    .send({ ...payload, districts: ['Unknown'] });

  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/No registered recipients/);
  expect(Alert.create).not.toHaveBeenCalled();
});

test('continues after an adapter failure and marks the alert partially dispatched', async () => {
  dispatchSMS.mockRejectedValueOnce(new Error('SMS Gateway Timeout'));

  const response = await request(app).post('/api/alerts').send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Partially Dispatched');
  expect(response.body.deliveryLogs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ channel: 'SMS', status: 'Failed', reason: 'SMS Gateway Timeout' }),
      expect.objectContaining({ channel: 'Push', status: 'Success' }),
    ])
  );
});
