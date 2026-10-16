const {
  RecipientResolutionError,
  resolveRecipients,
} = require('../src/services/recipientResolver');

const recipientIds = (result) => result.recipients.map((recipient) => recipient.citizenId);

test('resolves recipients for a single target area', () => {
  const result = resolveRecipients(['Colombo']);

  expect(recipientIds(result)).toEqual(['C001', 'C002', 'C003']);
  expect(result.recipientCount).toBe(3);
  expect(result.targetAreas).toEqual(['Colombo']);
});

test('resolves recipients across multiple target areas', () => {
  const result = resolveRecipients(['Colombo', 'Gampaha']);

  expect(recipientIds(result)).toEqual(['C001', 'C002', 'C003', 'C004']);
  expect(result.recipientCount).toBe(4);
  expect(result.targetAreas).toEqual(['Colombo', 'Gampaha']);
});

test('deduplicates citizens shared by overlapping districts and river basins', () => {
  const result = resolveRecipients(['Colombo', 'Kelani River Basin']);

  expect(recipientIds(result)).toEqual(['C001', 'C002', 'C003', 'C005']);
  expect(result.recipientCount).toBe(4);
});

test('deduplicates duplicate target area selections', () => {
  const result = resolveRecipients(['Colombo', 'Colombo']);

  expect(recipientIds(result)).toEqual(['C001', 'C002', 'C003']);
  expect(result.targetAreas).toEqual(['Colombo']);
});

test('throws a domain validation error when no citizens match', () => {
  expect(() => resolveRecipients(['Unknown Area'])).toThrow(RecipientResolutionError);
  expect(() => resolveRecipients(['Unknown Area'])).toThrow(
    'No citizens registered in selected target areas',
  );
});
