// Simulated records for development and tests only. These are not real citizens.
const citizens = [
  {
    citizenId: 'C001',
    name: 'Nimal Perera',
    districts: ['Colombo'],
    riverBasins: [],
    phoneNumber: '+94770000001',
    pushToken: 'simulated-push-token-c001',
  },
  {
    citizenId: 'C002',
    name: 'Ayesha Fernando',
    districts: ['Colombo'],
    riverBasins: ['Kelani River Basin'],
    phoneNumber: '+94770000002',
    pushToken: 'simulated-push-token-c002',
  },
  {
    citizenId: 'C003',
    name: 'Ruwan Silva',
    districts: ['Colombo', 'Gampaha'],
    riverBasins: [],
    phoneNumber: '+94770000003',
    pushToken: 'simulated-push-token-c003',
  },
  {
    citizenId: 'C004',
    name: 'Tharushi Jayasinghe',
    districts: ['Gampaha'],
    riverBasins: [],
    phoneNumber: '+94770000004',
    pushToken: 'simulated-push-token-c004',
  },
  {
    citizenId: 'C005',
    name: 'Kasun Wijeratne',
    districts: [],
    riverBasins: ['Kelani River Basin'],
    phoneNumber: '+94770000005',
    pushToken: 'simulated-push-token-c005',
  },
];

const findByTargetArea = (targetArea) =>
  citizens.filter(
    (citizen) =>
      citizen.districts.includes(targetArea) ||
      citizen.riverBasins.includes(targetArea),
  );

module.exports = {
  findByTargetArea,
  citizens,
};
