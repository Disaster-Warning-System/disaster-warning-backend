jest.mock('../src/models/User', () => ({
  findByIdAndUpdate: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const userRoutes = require('../src/routes/userRoutes');

process.env.JWT_SECRET = 'user-profile-notification-test-secret';
const app = express();
app.use(express.json());
app.use('/api/auth', userRoutes);
const citizenToken = jwt.sign({ id: 'citizen-1', role: 'Citizen' }, process.env.JWT_SECRET);
const officerToken = jwt.sign({ id: 'officer-1', role: 'DMC Officer' }, process.env.JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  User.findByIdAndUpdate.mockResolvedValue({
    _id: 'citizen-1', name: 'Citizen One', email: 'citizen@example.lk', role: 'Citizen',
    district: 'Colombo', riverBasins: ['Kelani River Basin'], phoneNumber: '+94770000000',
  });
});

test('updates an authenticated citizen area subscription and E.164 phone', async () => {
  const response = await request(app).patch('/api/auth/profile')
    .set('Authorization', `Bearer ${citizenToken}`)
    .send({ district: ' colombo ', riverBasins: ['Kelani River Basin'], phoneNumber: '+94770000000' });
  expect(response.status).toBe(200);
  expect(User.findByIdAndUpdate).toHaveBeenCalledWith('citizen-1', {
    district: 'Colombo', riverBasins: ['Kelani River Basin'], phoneNumber: '+94770000000',
  }, { new: true, runValidators: true });
  expect(response.body.data.user.district).toBe('Colombo');
});

test.each([
  [{ district: 'Atlantis', riverBasins: [], phoneNumber: '' }],
  [{ district: 'Colombo', riverBasins: ['Unknown Basin'], phoneNumber: '' }],
  [{ district: 'Colombo', riverBasins: [], phoneNumber: '0771234567' }],
  [{ district: '', riverBasins: [], phoneNumber: '' }],
])('rejects invalid profile area/contact values: %j', async (payload) => {
  const response = await request(app).patch('/api/auth/profile')
    .set('Authorization', `Bearer ${citizenToken}`).send(payload);
  expect(response.status).toBe(400);
  expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
});

test('registers and removes Expo push tokens for a signed-in citizen', async () => {
  const pushToken = 'ExponentPushToken[device-123]';
  const added = await request(app).put('/api/auth/push-token')
    .set('Authorization', `Bearer ${citizenToken}`).send({ pushToken });
  expect(added.status).toBe(200);
  expect(User.findByIdAndUpdate).toHaveBeenCalledWith('citizen-1', { $addToSet: { pushTokens: pushToken } });

  const removed = await request(app).delete('/api/auth/push-token')
    .set('Authorization', `Bearer ${citizenToken}`).send({ pushToken });
  expect(removed.status).toBe(200);
  expect(User.findByIdAndUpdate).toHaveBeenLastCalledWith('citizen-1', { $pull: { pushTokens: pushToken } });
});

test('rejects invalid push tokens and prevents staff from modifying citizen settings', async () => {
  const invalid = await request(app).put('/api/auth/push-token')
    .set('Authorization', `Bearer ${citizenToken}`).send({ pushToken: 'not-a-token' });
  expect(invalid.status).toBe(400);

  const forbidden = await request(app).patch('/api/auth/profile')
    .set('Authorization', `Bearer ${officerToken}`)
    .send({ district: 'Colombo', riverBasins: [], phoneNumber: '' });
  expect(forbidden.status).toBe(403);
  expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
});

test('requires authentication for the citizen profile and push-token routes', async () => {
  const profile = await request(app).patch('/api/auth/profile').send({ district: 'Colombo', riverBasins: [], phoneNumber: '' });
  const token = await request(app).put('/api/auth/push-token').send({ pushToken: 'ExpoPushToken[device]' });
  expect(profile.status).toBe(401);
  expect(token.status).toBe(401);
});
