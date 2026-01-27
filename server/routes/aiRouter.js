const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const aiCtrl = require('../controllers/aiCtrl');

const router = express.Router();

router.get('/status', aiCtrl.status);
router.post('/desks/:deskId/summary', authMiddleware, aiCtrl.summarizeDesk);
router.post('/desks/:deskId/chat', authMiddleware, aiCtrl.chatDesk);

module.exports = router;


