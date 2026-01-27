const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const groupsCtrl = require('../controllers/groupsCtrl');

const router = express.Router();

// Groups CRUD + membership management
router.post('/', authMiddleware, groupsCtrl.create);
router.get('/', authMiddleware, groupsCtrl.getMyGroups);
router.get('/invites', authMiddleware, groupsCtrl.getMyInvites);
router.get('/requests', authMiddleware, groupsCtrl.getMyJoinRequests);
router.post('/join', authMiddleware, groupsCtrl.joinByCode);
router.get('/:id', authMiddleware, groupsCtrl.getOne);
router.put('/:id', authMiddleware, groupsCtrl.update);
router.delete('/:id', authMiddleware, groupsCtrl.delete);

// Members & invites
router.get('/:id/members', authMiddleware, groupsCtrl.getMembers);
router.get('/:id/requests', authMiddleware, groupsCtrl.getJoinRequests);
router.post('/:id/requests/:userId/approve', authMiddleware, groupsCtrl.approveJoinRequest);
router.post('/:id/requests/:userId/deny', authMiddleware, groupsCtrl.denyJoinRequest);
router.post('/:id/invite', authMiddleware, groupsCtrl.invite);
router.post('/:id/invite/accept', authMiddleware, groupsCtrl.acceptInvite);
router.post('/:id/invite/decline', authMiddleware, groupsCtrl.declineInvite);
router.patch('/:id/members/:userId/role', authMiddleware, groupsCtrl.setMemberRole);
router.delete('/:id/members/:userId', authMiddleware, groupsCtrl.removeMember);

// Group desks
router.get('/:id/desks', authMiddleware, groupsCtrl.getGroupDesks);
router.post('/:id/desks', authMiddleware, groupsCtrl.createGroupDesk);

// Invite code
router.post('/:id/inviteCode/regenerate', authMiddleware, groupsCtrl.regenerateInviteCode);

module.exports = router;


