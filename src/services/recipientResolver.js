const citizensByArea = {
  Colombo: ['C001', 'C002', 'C003'],
  Gampaha: ['C003', 'C004'],
  'Kelani River Basin': ['C002', 'C005'],
};

const resolveRecipients = (areasArray) => {
  const uniqueRecipients = new Set();

  for (const area of areasArray) {
    for (const citizenId of citizensByArea[area] || []) {
      uniqueRecipients.add(citizenId);
    }
  }

  return uniqueRecipients;
};

module.exports = { resolveRecipients };