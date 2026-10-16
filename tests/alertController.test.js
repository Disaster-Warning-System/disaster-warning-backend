jest.mock('../src/models/Alert', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndDelete: jest.fn(),
}));
jest.mock('../src/models/User', () => ({ find: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
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
  resolveRegisteredRecipients: jest.fn(),
  RecipientResolutionError: class RecipientResolutionError extends Error {},
}));
jest.mock('../src/services/alertDispatchService', () => ({ dispatchAlertChannels: jest.fn() }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Alert = require('../src/models/Alert');
const HazardReport = require('../src/models/HazardReport');
const User = require('../src/models/User');
const { dispatchAlertChannels } = require('../src/services/alertDispatchService');
const { dispatchSMS } = require('../src/adapters/smsAdapter');
const { dispatchPush } = require('../src/adapters/pushAdapter');
const { resolveRecipients } = require('../src/services/recipientResolver');
const { resolveRegisteredRecipients } = require('../src/services/recipientResolver');
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
  targetMode: 'District',
  languages: ['English'],
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
  process.env.ALERT_MIN_RECIPIENTS_WARNING = '0';
  process.env.ALERT_MIN_RECIPIENTS_ADVISORY = '0';
  process.env.ALERT_MIN_RECIPIENTS_WATCH = '0';
  process.env.ALERT_MIN_RECIPIENTS_EVACUATION_ORDER = '0';
  resolveRecipients.mockReturnValue(new Set(['C001', 'C002', 'C003']));
  resolveRegisteredRecipients.mockResolvedValue({
    recipients: [{ citizenId: 'C001' }, { citizenId: 'C002' }, { citizenId: 'C003' }],
    recipientCount: 3,
    targetAreas: ['Colombo', 'Gampaha'],
  });
  dispatchAlertChannels.mockResolvedValue({ status: 'Dispatched', deliveryLogs: [
    { channel: 'SMS', status: 'Accepted', acceptedCount: 3, failedCount: 0, eligibleCount: 3, providerResults: ['C001', 'C002', 'C003'].map((userId) => ({ userId, status: 'Accepted' })) },
    { channel: 'Push', status: 'Accepted', acceptedCount: 3, failedCount: 0, eligibleCount: 3, providerResults: ['C001', 'C002', 'C003'].map((userId) => ({ userId, status: 'Accepted' })) },
  ] });
  dispatchSMS.mockResolvedValue({ channel: 'SMS', status: 'Success' });
  dispatchPush.mockResolvedValue({
    channel: 'Push',
    status: 'Success',
    bypassSilent: true,
  });
  Alert.create.mockImplementation(async (data) => createAlertEntity(data));
  const emptyAlertQuery = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
    sort: jest.fn().mockResolvedValue([]),
  };
  Alert.find.mockReturnValue(emptyAlertQuery);
  HazardReport.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', status: 'Verified' }),
  });
  HazardReport.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', status: 'Verified' }),
  });
  User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ district: 'Colombo', riverBasins: [] }) }) });
});

test('creates and dispatches a validated alert', async () => {
  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Dispatched');
  expect(response.body.alert.deliveryLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: 'SMS', status: 'Accepted' }),
    expect.objectContaining({ channel: 'Push', status: 'Accepted' }),
  ]));
  expect(response.body.recipientsAcceptedByProvider).toBe(3);
  expect(Alert.create).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'Dispatching' }),
  );
  expect(dispatchAlertChannels).toHaveBeenCalledWith(expect.objectContaining({
    recipients: expect.any(Array), channels: ['SMS', 'Push'], severity: 'Warning',
  }));
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
  [{ ...payload, languages: ['French'] }],
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
  resolveRegisteredRecipients.mockResolvedValue({ recipients: [], recipientCount: 0, targetAreas: ['Colombo', 'Gampaha'] });

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/No registered recipients/);
  expect(Alert.create).not.toHaveBeenCalled();
});

test('continues to the next adapter when SMS fails and records a partial dispatch', async () => {
  dispatchAlertChannels.mockResolvedValueOnce({ status: 'Partially Dispatched', deliveryLogs: [
    { channel: 'SMS', status: 'Failed', reason: 'SMS Gateway Timeout' },
    { channel: 'Push', status: 'Accepted' },
  ] });

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(dispatchAlertChannels).toHaveBeenCalled();
  expect(response.body.alert.status).toBe('Partially Dispatched');
  expect(response.body.alert.deliveryLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: 'SMS', status: 'Failed', reason: 'SMS Gateway Timeout' }),
    expect.objectContaining({ channel: 'Push', status: 'Accepted' }),
  ]));
});

test('marks an alert failed when every selected delivery channel fails', async () => {
  dispatchAlertChannels.mockResolvedValueOnce({ status: 'Failed', deliveryLogs: [
    { channel: 'SMS', status: 'Failed', reason: 'SMS offline' },
    { channel: 'Push', status: 'Failed', reason: 'Push offline' },
  ] });

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
  expect(Alert.find).toHaveBeenCalledWith({ status: { $ne: 'Draft' } });
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
  const query = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue(feed) };
  Alert.find.mockReturnValueOnce(query);

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

test('preview resolves unique registered recipients and reports review requirements', async () => {
  process.env.ALERT_MIN_RECIPIENTS_WARNING = '50';
  const conflict = { alertId: 'ALT-existing', headline: 'River alert', severity: 'Watch', targetAreas: ['Colombo'], status: 'Dispatched', issuedAt: new Date() };
  Alert.find.mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([conflict]) });
  const response = await request(app).post('/api/alerts/preview')
    .set('Authorization', `Bearer ${officerToken}`)
    .send({ severity: 'Warning', targetMode: 'District', targetAreas: ['Colombo'], channels: ['SMS'] });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ recipientCount: 3, minimumRecipients: 50, belowMinimum: true, noRecipients: false });
  expect(response.body.conflicts[0].alertId).toBe('ALT-existing');
  expect(Alert.create).not.toHaveBeenCalled();
});

test('blocks dispatch below the configured minimum unless the officer acknowledges it', async () => {
  process.env.ALERT_MIN_RECIPIENTS_WARNING = '50';
  const response = await request(app).post('/api/alerts').set('Authorization', `Bearer ${officerToken}`).send(payload);
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('LOW_RECIPIENT_COUNT');
  expect(Alert.create).not.toHaveBeenCalled();
  expect(dispatchAlertChannels).not.toHaveBeenCalled();
});

test('allows low-recipient dispatch after explicit officer acknowledgement', async () => {
  process.env.ALERT_MIN_RECIPIENTS_WARNING = '50';
  const response = await request(app).post('/api/alerts').set('Authorization', `Bearer ${officerToken}`)
    .send({ ...payload, minimumAcknowledged: true });
  expect(response.status).toBe(201);
  expect(Alert.create).toHaveBeenCalled();
  expect(dispatchAlertChannels).toHaveBeenCalled();
});

test('blocks a warning with a recent overlapping active warning until acknowledged', async () => {
  const conflict = { alertId: 'ALT-old', headline: 'Current flood warning', severity: 'Watch', targetAreas: ['Colombo'], status: 'Dispatched', issuedAt: new Date() };
  Alert.find.mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([conflict]) });
  const response = await request(app).post('/api/alerts').set('Authorization', `Bearer ${officerToken}`).send(payload);
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('CONFLICTING_WARNING');
  expect(Alert.create).not.toHaveBeenCalled();
  expect(dispatchAlertChannels).not.toHaveBeenCalled();
});

test('links an escalation or update to its active source warning', async () => {
  Alert.findOne.mockResolvedValueOnce({ alertId: 'ALT-original', status: 'Dispatched' });
  const response = await request(app).post('/api/alerts').set('Authorization', `Bearer ${officerToken}`).send({
    ...payload, supersedesAlertId: 'ALT-original', conflictAcknowledged: true,
  });
  expect(response.status).toBe(201);
  expect(Alert.create).toHaveBeenCalledWith(expect.objectContaining({ supersedesAlertId: 'ALT-original' }));
});

test('persists a draft with its author and does not dispatch it', async () => {
  const response = await request(app).post('/api/alerts/drafts').set('Authorization', `Bearer ${officerToken}`).send({
    headline: 'Draft flood warning', targetMode: 'District', targetAreas: ['Colombo'], channels: ['SMS'],
  });
  expect(response.status).toBe(201);
  expect(Alert.create).toHaveBeenCalledWith(expect.objectContaining({
    status: 'Draft', createdBy: 'officer-1', headline: 'Draft flood warning', targetAreas: ['Colombo'],
  }));
  expect(dispatchAlertChannels).not.toHaveBeenCalled();
});

test('scopes draft reads to the authenticated DMC officer', async () => {
  Alert.findOne.mockResolvedValueOnce({ alertId: 'ALT-draft', status: 'Draft' });
  const response = await request(app).get('/api/alerts/drafts/ALT-draft').set('Authorization', `Bearer ${officerToken}`);
  expect(response.status).toBe(200);
  expect(Alert.findOne).toHaveBeenCalledWith({ alertId: 'ALT-draft', status: 'Draft', createdBy: 'officer-1' });
});

test('rejects district and river-basin mismatches at the API boundary', async () => {
  const response = await request(app).post('/api/alerts').set('Authorization', `Bearer ${officerToken}`).send({
    ...payload, targetMode: 'District', targetAreas: ['Kelani River Basin'],
  });
  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/chosen targeting mode/i);
  expect(Alert.create).not.toHaveBeenCalled();
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
  expect(dispatchAlertChannels).not.toHaveBeenCalled();
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
      targetAreas: ['Kelani River Basin', 'Kelani River Basin'],
      selectedDeliveryChannels: ['SMS', 'SMS'],
      languages: ['English'],
    });

  expect(response.status).toBe(201);
  expect(Alert.create).toHaveBeenCalledWith(expect.objectContaining({
    targetMode: 'River Basin',
    targetAreas: ['Kelani River Basin'],
    selectedDeliveryChannels: ['SMS'],
    instructions: 'Move to higher ground.',
  }));
  expect(dispatchAlertChannels).toHaveBeenCalledTimes(1);
});

test('retries an SMS timeout and dispatches successfully with Push', async () => {
  const timeout = Object.assign(new Error('SMS timeout'), { code: 'SMS_TIMEOUT' });
  dispatchAlertChannels.mockResolvedValueOnce({ status: 'Dispatched', deliveryLogs: [
    { channel: 'SMS', status: 'Accepted', attempts: 2 }, { channel: 'Push', status: 'Accepted' },
  ] });

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Dispatched');
  expect(dispatchAlertChannels).toHaveBeenCalledTimes(1);
  expect(response.body.alert.deliveryLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: 'SMS', status: 'Accepted', attempts: 2 }),
    expect.objectContaining({ channel: 'Push', status: 'Accepted' }),
  ]));
});

test('records Push failure while SMS succeeds', async () => {
  dispatchAlertChannels.mockResolvedValueOnce({ status: 'Partially Dispatched', deliveryLogs: [
    { channel: 'SMS', status: 'Accepted' }, { channel: 'Push', status: 'Failed', reason: 'Push gateway failure' },
  ] });

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.alert.status).toBe('Partially Dispatched');
  expect(dispatchAlertChannels).toHaveBeenCalled();
  expect(response.body.alert.deliveryLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: 'SMS', status: 'Accepted' }),
    expect.objectContaining({ channel: 'Push', status: 'Failed', reason: 'Push gateway failure' }),
  ]));
});

test('marks the alert Failed when every selected channel fails and persists logs', async () => {
  dispatchAlertChannels.mockResolvedValueOnce({ status: 'Failed', deliveryLogs: [
    { channel: 'SMS', status: 'Failed' }, { channel: 'Push', status: 'Failed' },
  ] });

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
  dispatchAlertChannels.mockResolvedValueOnce({ status: 'Partially Dispatched', deliveryLogs: [
    { channel: 'SMS', status: 'Failed', reason: 'Adapter contract failed' }, { channel: 'Push', status: 'Accepted' },
  ] });

  const response = await request(app)
    .post('/api/alerts')
    .set('Authorization', `Bearer ${officerToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(dispatchAlertChannels).toHaveBeenCalled();
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
  resolveRegisteredRecipients.mockImplementationOnce(() => {
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
  Alert.find.mockReturnValueOnce({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue(feed) });

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

test('protects citizen feed and returns area-matched feed to citizens', async () => {
  const missing = await request(app).get('/api/alerts/feed');
  expect(missing.status).toBe(401);

  const invalid = await request(app)
    .get('/api/alerts/feed')
    .set('Authorization', 'Bearer invalid-token');
  expect(invalid.status).toBe(401);

  const citizenToken = jwt.sign({ id: 'citizen-1', role: 'Citizen' }, process.env.JWT_SECRET);
  const feed = [{ alertId: 'ALT-citizen', status: 'Dispatched' }];
  Alert.find.mockReturnValueOnce({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue(feed) });
  const citizenFeed = await request(app)
    .get('/api/alerts/feed')
    .set('Authorization', `Bearer ${citizenToken}`);
  expect(citizenFeed.status).toBe(200);
  expect(citizenFeed.body.alerts).toEqual(feed);
  expect(User.findById).toHaveBeenCalledWith('citizen-1');
  expect(Alert.find).toHaveBeenCalledWith({ status: { $in: ['Dispatched', 'Partially Dispatched'] }, targetAreas: { $in: ['Colombo'] } });
});
