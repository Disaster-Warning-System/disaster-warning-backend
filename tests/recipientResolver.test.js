jest.mock('../src/models/User', () => ({ find: jest.fn() }));

const User = require('../src/models/User');
const { RecipientResolutionError, resolveRecipients, resolveRegisteredRecipients } = require('../src/services/recipientResolver');

const registeredUsers = [
  { _id: 'user-1', name: 'One', district: 'Colombo', riverBasins: ['Kelani River Basin'], phoneNumber: '+94770000001', pushTokens: ['ExpoPushToken[one]'] },
  { _id: 'user-2', name: 'Two', district: 'Gampaha', riverBasins: [], phoneNumber: '', pushTokens: [] },
];

beforeEach(() => {
  jest.clearAllMocks();
  User.find.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(registeredUsers),
  });
});

test('queries citizen and volunteer records, canonicalizes areas, and returns delivery details', async () => {
  const result = await resolveRegisteredRecipients([' colombo ', 'Kelani River Basin', 'Colombo']);
  expect(User.find).toHaveBeenCalledWith({
    role: { $in: ['Citizen', 'Volunteer'] },
    $or: [
      { district: { $in: ['Colombo'] } },
      { riverBasins: { $in: ['Kelani River Basin'] } },
    ],
  });
  expect(result.targetAreas).toEqual(['Colombo', 'Kelani River Basin']);
  expect(result.recipientCount).toBe(2);
  expect(result.recipients[0]).toMatchObject({ citizenId: 'user-1', phoneNumber: '+94770000001', pushTokens: ['ExpoPushToken[one]'] });
});

test('blocks empty recipient sets for dispatch but supports empty previews', async () => {
  User.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
  await expect(resolveRegisteredRecipients(['Colombo'])).rejects.toBeInstanceOf(RecipientResolutionError);
  await expect(resolveRegisteredRecipients(['Colombo'], { allowEmpty: true })).resolves.toMatchObject({ recipientCount: 0, recipients: [] });
});

test('rejects unknown or empty areas before querying users', async () => {
  await expect(resolveRegisteredRecipients(['Atlantis'])).rejects.toThrow(/supported districts or river basins/i);
  await expect(resolveRegisteredRecipients([])).rejects.toThrow(/target areas must be an array/i);
  expect(User.find).not.toHaveBeenCalled();
});

test('retains the legacy mock repository helper for existing adapter-focused callers', () => {
  const repository = { findByTargetArea: (area) => area === 'Colombo' ? [{ citizenId: 'C1' }] : [{ citizenId: 'C1' }, { citizenId: 'C2' }] };
  const result = resolveRecipients(['Colombo', 'Kelani River Basin'], repository);
  expect(result.recipients.map((recipient) => recipient.citizenId)).toEqual(['C1', 'C2']);
});
