const citizenRepository = require('../repositories/mockCitizenRepository');

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

module.exports = { RecipientResolutionError, resolveRecipients };