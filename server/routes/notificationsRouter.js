const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const notificationsCtrl = require('../controllers/notificationsCtrl');

const router = express.Router();

router.get('/my', authMiddleware, notificationsCtrl.listMy);
router.post('/:id/read', authMiddleware, notificationsCtrl.markRead);

module.exports = router;


