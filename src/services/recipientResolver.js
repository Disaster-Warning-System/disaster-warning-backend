const citizenRepository = require('../repositories/mockCitizenRepository');
const User = require('../models/User');
const { DISTRICTS, RIVER_BASINS, normalizeAreaName } = require('../utils/areas');

class RecipientResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecipientResolutionError';
    this.statusCode = 400;
  }
}

const normalizeTargetAreas = (targetAreas) => {
  if (!Array.isArray(targetAreas)) {
    throw new RecipientResolutionError('Selected target areas must be an array.');
  }

  const normalizedAreas = [
    ...new Set(
      targetAreas
        .filter((area) => typeof area === 'string')
        .map((area) => area.trim())
        .filter(Boolean),
    ),
  ];

  if (normalizedAreas.length === 0) {
    throw new RecipientResolutionError('At least one target area is required.');
  }

  return normalizedAreas;
};

const resolveRecipients = (targetAreas, repository = citizenRepository) => {
  const normalizedAreas = normalizeTargetAreas(targetAreas);
  const recipientIds = new Set();
  const recipients = [];

  for (const targetArea of normalizedAreas) {
    for (const citizen of repository.findByTargetArea(targetArea)) {
      if (!recipientIds.has(citizen.citizenId)) {
        recipientIds.add(citizen.citizenId);
        recipients.push(citizen);
      }
    }
  }

  if (recipients.length === 0) {
    throw new RecipientResolutionError(
      `No citizens registered in selected target areas (simulated repository): ${normalizedAreas.join(', ')}.`,
    );
  }

  return {
    recipients,
    recipientCount: recipients.length,
    targetAreas: normalizedAreas,
  };
};

const resolveRegisteredRecipients = async (targetAreas, { allowEmpty = false } = {}) => {
  if (!Array.isArray(targetAreas) || targetAreas.length === 0) {
    throw new RecipientResolutionError('Selected target areas must be an array.');
  }
  const canonicalAreas = targetAreas.map(normalizeAreaName);
  if (canonicalAreas.some((area) => !area)) {
    throw new RecipientResolutionError('Select one or more supported districts or river basins.');
  }
  const normalizedAreas = [...new Set(canonicalAreas)];

  const districts = normalizedAreas.filter((area) => DISTRICTS.includes(area));
  const riverBasins = normalizedAreas.filter((area) => RIVER_BASINS.includes(area));
  const userQuery = { role: { $in: ['Citizen', 'Volunteer'] } };
  const matches = [];
  if (districts.length) matches.push({ district: { $in: districts } });
  if (riverBasins.length) matches.push({ riverBasins: { $in: riverBasins } });

  const users = await User.find({ ...userQuery, $or: matches })
    .select('_id name email district riverBasins phoneNumber pushTokens')
    .lean();
  const recipients = [...new Map(users.map((user) => [String(user._id), {
    citizenId: String(user._id),
    name: user.name,
    email: user.email || '',
    district: user.district || '',
    riverBasins: user.riverBasins || [],
    phoneNumber: user.phoneNumber || '',
    pushTokens: [...new Set(user.pushTokens || [])],
  }])).values()];

  if (!allowEmpty && recipients.length === 0) {
    throw new RecipientResolutionError(
      `No registered citizens or volunteers match the selected areas: ${normalizedAreas.join(', ')}.`,
    );
  }

  return { recipients, recipientCount: recipients.length, targetAreas: normalizedAreas };
};

module.exports = { RecipientResolutionError, resolveRecipients, resolveRegisteredRecipients };
