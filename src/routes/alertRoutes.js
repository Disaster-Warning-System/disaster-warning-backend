const express = require('express');
const { createAlert, getAlerts } = require('../controllers/alertController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', protect, requireRole('DMC Officer'), createAlert);
router.get('/', getAlerts);

module.exports = router;
