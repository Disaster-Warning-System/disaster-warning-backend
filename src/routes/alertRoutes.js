const express = require('express');
const { createAlert, getAlerts } = require('../controllers/alertController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect, requireRole('DMC Officer'));
router.post('/', createAlert);
router.get('/', getAlerts);

module.exports = router;
