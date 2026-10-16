const express = require('express');
const {
  createAlert,
  previewAlert,
  createDraft,
  getDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
  getAlerts,
  getAlert,
  getCitizenFeed,
  getDeliveryDetails,
} = require('../controllers/alertController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Citizens and volunteers see only alerts aimed at the areas on their account.
router.get('/feed', protect, requireRole('DMC Officer', 'Citizen', 'Volunteer'), getCitizenFeed);

router.use(protect, requireRole('DMC Officer'));
router.get('/drafts', getDrafts);
router.post('/drafts', createDraft);
router.get('/drafts/:alertId', getDraft);
router.put('/drafts/:alertId', updateDraft);
router.delete('/drafts/:alertId', deleteDraft);
router.post('/preview', previewAlert);
router.post('/', createAlert);
router.get('/:alertId/delivery-details', getDeliveryDetails);
router.get('/', getAlerts);
router.get('/:alertId', getAlert);

module.exports = router;
