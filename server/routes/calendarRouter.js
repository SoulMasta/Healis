const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const calendarCtrl = require('../controllers/calendarCtrl');

const router = express.Router();

// Student calendar
router.get('/my', authMiddleware, calendarCtrl.getMyCalendar);
router.post('/my/events', authMiddleware, calendarCtrl.createMyEvent);
router.delete('/my/events/:myEventId', authMiddleware, calendarCtrl.deleteMyEvent);
router.post('/my/invites/:inviteId/respond', authMiddleware, calendarCtrl.respondToInvite);
router.post('/my/period-invites/:inviteId/respond', authMiddleware, calendarCtrl.respondToPeriodInvite);

// Group calendar management (starosta/admin)
router.get('/groups/:groupId/events', authMiddleware, calendarCtrl.getGroupEvents);
router.post('/groups/:groupId/events', authMiddleware, calendarCtrl.createGroupEvent);
router.delete('/groups/:groupId/events/:eventId', authMiddleware, calendarCtrl.deleteGroupEvent);

router.get('/groups/:groupId/periods', authMiddleware, calendarCtrl.getGroupPeriods);
router.post('/groups/:groupId/periods', authMiddleware, calendarCtrl.createGroupPeriod);
router.delete('/groups/:groupId/periods/:periodId', authMiddleware, calendarCtrl.deleteGroupPeriod);

// Debug helpers (optional)
router.delete('/groups/:groupId/_debug/notification-logs', authMiddleware, calendarCtrl._debugClearNotificationLogs);

module.exports = router;


