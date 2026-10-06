// Simulates resolving overlapping districts using a Set to prevent duplicates
const resolveRecipients = (districts) => {
    const mockDatabase = {
        'Colombo': ['user1', 'user2', 'user3'],
        'Gampaha': ['user3', 'user4'], // user3 overlaps
        'Kalutara': ['user5']
    };

    let recipientSet = new Set();
    districts.forEach(district => {
        if (mockDatabase[district]) {
            mockDatabase[district].forEach(user => recipientSet.add(user));
        }
    });

    return recipientSet;
};

module.exports = { resolveRecipients };