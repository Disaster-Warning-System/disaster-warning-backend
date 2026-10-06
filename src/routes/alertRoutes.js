const express = require('express');
const { createAlert, getAlerts } = require('../controllers/alertController');

const router = express.Router();

router.post('/', createAlert);
router.get('/', getAlerts);

module.exports = router;
