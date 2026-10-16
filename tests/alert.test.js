jest.mock('../src/models/Alert', () => ({ create: jest.fn(), find: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/models/User', () => ({ find: jest.fn(), findById: jest.fn() }));
jest.mock('../src/models/HazardReport', () => ({ findById: jest.fn() }));
jest.mock('../src/services/recipientResolver', () => ({ resolveRegisteredRecipients: jest.fn() }));
jest.mock('../src/services/alertDispatchService', () => ({ dispatchAlertChannels: jest.fn() }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Alert = require('../src/models/Alert');
const { resolveRegisteredRecipients } = require('../src/services/recipientResolver');
const { dispatchAlertChannels } = require('../src/services/alertDispatchService');
const alertRoutes = require('../src/routes/alertRoutes');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.ALERT_MIN_RECIPIENTS_WARNING = '0';
const officerToken = jwt.sign({ id: 'officer-1', role: 'DMC Officer' }, process.env.JWT_SECRET);
const app = express();
app.use(express.json());
app.use('/api/alerts', alertRoutes);

const payload = {
  hazardType: 'Flood', headline: 'Flood warning', instructions: 'Move to higher ground',
  severity: 'Warning', targetMode: 'District', targetAreas: ['Colombo', 'Gampaha'],
  languages: ['English'], channels: ['SMS', 'Push'],
};

beforeEach(() => {
  jest.clearAllMocks();
  resolveRegisteredRecipients.mockResolvedValue({
    recipients: [{ citizenId: 'C1' }, { citizenId: 'C2' }], recipientCount: 2, targetAreas: payload.targetAreas,
  });
  dispatchAlertChannels.mockResolvedValue({ status: 'Dispatched', deliveryLogs: [
    { channel: 'SMS', status: 'Accepted' }, { channel: 'Push', status: 'Accepted' },
  ] });
  Alert.create.mockImplementation(async (data) => ({ ...data, save: jest.fn().mockResolvedValue(undefined) }));
  Alert.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
});

test('persists a dispatching warning and returns channel delivery logs', async () => {
  const response = await request(app).post('/api/alerts').set('Authorization', `Bearer ${officerToken}`).send(payload);
  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Dispatched');
  expect(response.body.alert.deliveryLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: 'SMS', status: 'Accepted' }),
    expect.objectContaining({ channel: 'Push', status: 'Accepted' }),
  ]));
  expect(Alert.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'Dispatching', targetAreas: ['Colombo', 'Gampaha'] }));
  expect(resolveRegisteredRecipients).toHaveBeenCalledWith(payload.targetAreas, undefined);
});

test('rejects a missing required warning headline', async () => {
  const response = await request(app).post('/api/alerts').set('Authorization', `Bearer ${officerToken}`).send({ ...payload, headline: '' });
  expect(response.status).toBe(400);
  expect(Alert.create).not.toHaveBeenCalled();
  expect(dispatchAlertChannels).not.toHaveBeenCalled();
});

test('aborts when recipient resolution returns an empty set', async () => {
  resolveRegisteredRecipients.mockResolvedValueOnce({ recipients: [], recipientCount: 0, targetAreas: ['Colombo'] });
  const response = await request(app).post('/api/alerts').set('Authorization', `Bearer ${officerToken}`).send(payload);
  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/No registered recipients/);
  expect(Alert.create).not.toHaveBeenCalled();
  expect(dispatchAlertChannels).not.toHaveBeenCalled();
});

test('keeps the warning partially dispatched when a selected adapter reports failure', async () => {
  dispatchAlertChannels.mockResolvedValueOnce({ status: 'Partially Dispatched', deliveryLogs: [
    { channel: 'SMS', status: 'Failed', reason: 'Gateway unavailable' }, { channel: 'Push', status: 'Accepted' },
  ] });
  const response = await request(app).post('/api/alerts').set('Authorization', `Bearer ${officerToken}`).send(payload);
  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Partially Dispatched');
  expect(response.body.alert.deliveryLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: 'SMS', status: 'Failed', reason: 'Gateway unavailable' }),
    expect.objectContaining({ channel: 'Push', status: 'Accepted' }),
  ]));
});
