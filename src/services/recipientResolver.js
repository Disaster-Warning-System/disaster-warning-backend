const resolveRecipients = (areas) => {
    // Mock database of citizens by area
    const database = {
        'Colombo': ['C001', 'C002', 'C003'],
        'Gampaha': ['C003', 'C004'], // C003 overlaps both districts
        'Kelani River Basin': ['C002', 'C005']
    };

    const uniqueRecipients = new Set();
    new Set(areas).forEach(area => {
        if (database[area]) {
            database[area].forEach(citizen => uniqueRecipients.add(citizen));
        }
    });
    return uniqueRecipients;
};
module.exports = { resolveRecipients };