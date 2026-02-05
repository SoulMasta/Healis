const { Op } = require('sequelize');
const sequelize = require('../db');
const { Group, GroupMember, User, Desk, Project } = require('../models/models');
const crypto = require('crypto');
const { createNotificationForUser } = require('../services/notificationService');

function requireAuth(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Not authorized' });
    return null;
  }
  return userId;
}

async function getActiveMembership(groupId, userId) {
  return GroupMember.findOne({
    where: { groupId, userId, status: 'ACTIVE' },
  });
}

async function getAnyMembership(groupId, userId) {
  return GroupMember.findOne({
    where: { groupId, userId },
  });
}

async function getMyGroupRole(groupId, userId) {
  const m = await getActiveMembership(groupId, userId);
  if (m?.role) return m.role;

  // Back-compat: older DB rows may exist without a GroupMember entry.
  const group = await Group.findByPk(groupId);
  if (group && group.userId === userId) return 'OWNER';

  return null;
}

function isOwner(role) {
  return role === 'OWNER';
}

function isAdmin(role) {
  return role === 'ADMIN';
}

function canManageGroup(role) {
  return role === 'OWNER' || role === 'ADMIN';
}

function makeInviteCode(len = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

class GroupsController {
  async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const { name, description } = req.body || {};
      if (!name) {
        await t.rollback();
        return res.status(400).json({ error: 'name is required' });
      }

      // Generate a shareable inviteCode so others can join the group from Groups tab.
      let group = null;
      let tries = 0;
      while (!group && tries < 8) {
        tries += 1;
        const inviteCode = makeInviteCode(10);
        try {
          // eslint-disable-next-line no-await-in-loop
          group = await Group.create(
            {
              name,
              description,
              userId,
              inviteCode,
            },
            { transaction: t }
          );
        } catch (e) {
          // Retry on inviteCode collision (very rare).
          const msg = String(e?.message || '');
          if (msg.toLowerCase().includes('invitecode') && (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate'))) {
            continue;
          }
          throw e;
        }
      }
      if (!group) {
        throw new Error('Failed to generate unique invite code');
      }

      await GroupMember.create(
        {
          groupId: group.groupId,
          userId,
          role: 'OWNER',
          status: 'ACTIVE',
        },
        { transaction: t }
      );

      await t.commit();
      return res.status(201).json(group);
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  // List groups where current user is an ACTIVE member.
  async getMyGroups(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const memberships = await GroupMember.findAll({
        where: { userId, status: 'ACTIVE' },
        include: [{ model: Group }],
        order: [[Group, 'groupId', 'DESC']],
      });

      const groupsFromMembership = memberships
        .map((m) => (m.group ? { ...m.group.toJSON(), myRole: m.role } : null))
        .filter(Boolean);

      // Back-compat: include groups owned by user that don't have a membership record yet.
      const owned = await Group.findAll({ where: { userId } });
      const seen = new Set(groupsFromMembership.map((g) => g.groupId));
      const merged = groupsFromMembership.concat(
        owned
          .filter((g) => !seen.has(g.groupId))
          .map((g) => ({ ...g.toJSON(), myRole: 'OWNER' }))
      );

      return res.json(merged);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // List incoming invitations for current user.
  async getMyInvites(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const invites = await GroupMember.findAll({
        where: { userId, status: 'INVITED' },
        include: [{ model: Group }],
        order: [['id', 'DESC']],
      });

      return res.json(
        invites
          .filter((m) => m.group)
          .map((m) => ({
            id: m.id,
            groupId: m.groupId,
            userId: m.userId,
            status: m.status,
            role: m.role,
            group: m.group ? m.group.toJSON() : null,
          }))
      );
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // List join requests created by current user (REQUESTED status).
  async getMyJoinRequests(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const rows = await GroupMember.findAll({
        where: { userId, status: 'REQUESTED' },
        include: [{ model: Group }],
        order: [['id', 'DESC']],
      });

      return res.json(
        rows
          .filter((m) => m.group)
          .map((m) => ({
            id: m.id,
            groupId: m.groupId,
            userId: m.userId,
            status: m.status,
            role: m.role,
            group: m.group ? m.group.toJSON() : null,
          }))
      );
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getOne(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      if (!groupId) return res.status(400).json({ error: 'Invalid group id' });

      const role = await getMyGroupRole(groupId, userId);
      if (!role) return res.status(404).json({ error: 'Group not found' });

      const group = await Group.findByPk(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      return res.json({ ...group.toJSON(), myRole: role });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      if (!groupId) return res.status(400).json({ error: 'Invalid group id' });

      const myRole = await getMyGroupRole(groupId, userId);
      if (!myRole) return res.status(404).json({ error: 'Group not found' });
      if (!canManageGroup(myRole)) return res.status(403).json({ error: 'Forbidden' });

      const group = await Group.findByPk(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      const { name, description } = req.body || {};
      if (name !== undefined) group.name = name;
      if (description !== undefined) group.description = description;
      await group.save();

      return res.json(group);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async delete(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      if (!groupId) return res.status(400).json({ error: 'Invalid group id' });

      const myRole = await getMyGroupRole(groupId, userId);
      if (!myRole) return res.status(404).json({ error: 'Group not found' });
      if (!isOwner(myRole)) return res.status(403).json({ error: 'Forbidden' });

      const group = await Group.findByPk(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      await group.destroy(); // cascades to group_members
      return res.json({ message: 'Group deleted successfully' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getMembers(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      if (!groupId) return res.status(400).json({ error: 'Invalid group id' });

      const role = await getMyGroupRole(groupId, userId);
      if (!role) return res.status(404).json({ error: 'Group not found' });

      const where = canManageGroup(role) ? { groupId } : { groupId, status: 'ACTIVE' };
      const members = await GroupMember.findAll({
        where,
        include: [{ model: User, attributes: ['id', 'email', 'username', 'nickname'] }],
        order: [['role', 'ASC'], ['id', 'ASC']],
      });

      return res.json(
        members.map((m) => ({
          id: m.id,
          groupId: m.groupId,
          userId: m.userId,
          role: m.role,
          status: m.status,
          user: m.user ? { id: m.user.id, email: m.user.email, username: m.user.username, nickname: m.user.nickname } : null,
        }))
      );
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Owner/Admin: list join requests (REQUESTED) for a group.
  async getJoinRequests(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      if (!groupId) return res.status(400).json({ error: 'Invalid group id' });

      const myRole = await getMyGroupRole(groupId, userId);
      if (!myRole) return res.status(404).json({ error: 'Group not found' });
      if (!canManageGroup(myRole)) return res.status(403).json({ error: 'Forbidden' });

      const requests = await GroupMember.findAll({
        where: { groupId, status: 'REQUESTED' },
        include: [{ model: User, attributes: ['id', 'email', 'username', 'nickname'] }],
        order: [['id', 'DESC']],
      });

      return res.json(
        requests.map((m) => ({
          id: m.id,
          groupId: m.groupId,
          userId: m.userId,
          role: m.role,
          status: m.status,
          user: m.user ? { id: m.user.id, email: m.user.email, username: m.user.username, nickname: m.user.nickname } : null,
        }))
      );
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Owner/Admin: approve a join request => member becomes ACTIVE.
  async approveJoinRequest(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      const targetUserId = Number(req.params.userId);
      if (!groupId || !targetUserId) return res.status(400).json({ error: 'Invalid id' });

      const myRole = await getMyGroupRole(groupId, userId);
      if (!myRole) return res.status(404).json({ error: 'Group not found' });
      if (!canManageGroup(myRole)) return res.status(403).json({ error: 'Forbidden' });

      const membership = await GroupMember.findOne({ where: { groupId, userId: targetUserId } });
      if (!membership || membership.status !== 'REQUESTED') {
        return res.status(404).json({ error: 'Join request not found' });
      }

      membership.status = 'ACTIVE';
      await membership.save();
      return res.json(membership);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Owner/Admin: deny a join request => request removed.
  async denyJoinRequest(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      const targetUserId = Number(req.params.userId);
      if (!groupId || !targetUserId) return res.status(400).json({ error: 'Invalid id' });

      const myRole = await getMyGroupRole(groupId, userId);
      if (!myRole) return res.status(404).json({ error: 'Group not found' });
      if (!canManageGroup(myRole)) return res.status(403).json({ error: 'Forbidden' });

      const membership = await GroupMember.findOne({ where: { groupId, userId: targetUserId } });
      if (!membership || membership.status !== 'REQUESTED') {
        return res.status(404).json({ error: 'Join request not found' });
      }

      await membership.destroy();
      return res.json({ message: 'Join request denied' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async invite(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const groupId = Number(req.params.id);
      if (!groupId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid group id' });
      }

      const myRole = await getMyGroupRole(groupId, userId);
      if (!myRole) {
        await t.rollback();
        return res.status(404).json({ error: 'Group not found' });
      }
      if (!canManageGroup(myRole)) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { username: usernameRaw, email, userId: invitedUserIdRaw } = req.body || {};
      let invitedUser = null;
      if (invitedUserIdRaw) {
        invitedUser = await User.findByPk(invitedUserIdRaw);
      } else if (usernameRaw) {
        const username = String(usernameRaw || '').trim().replace(/^@/, '');
        if (username) {
          invitedUser = await User.findOne({ where: { username }, transaction: t });
          if (!invitedUser) {
            // Case-insensitive lookup for Postgres / older clients.
            invitedUser = await User.findOne({
              where: sequelize.where(sequelize.fn('lower', sequelize.col('username')), username.toLowerCase()),
              transaction: t,
            });
          }
        }
      } else if (email) {
        invitedUser = await User.findOne({ where: { email } });
      }

      if (!invitedUser) {
        await t.rollback();
        return res.status(404).json({ error: 'User not found' });
      }

      if (invitedUser.id === userId) {
        await t.rollback();
        return res.status(400).json({ error: 'Cannot invite yourself' });
      }

      const existing = await GroupMember.findOne({
        where: { groupId, userId: invitedUser.id },
        transaction: t,
      });
      if (existing) {
        await t.commit();
        return res.json(existing);
      }

      const membership = await GroupMember.create(
        {
          groupId,
          userId: invitedUser.id,
          role: 'MEMBER',
          status: 'INVITED',
        },
        { transaction: t }
      );

      await t.commit();

      // Push a persistent + realtime notification to invited user.
      try {
        const group = await Group.findByPk(groupId);
        await createNotificationForUser({
          userId: invitedUser.id,
          type: 'GROUP_INVITE',
          title: 'Приглашение в группу',
          body: group?.name ? `Вас пригласили в группу «${group.name}».` : 'Вас пригласили в группу.',
          payload: {
            groupId,
            group: group ? group.toJSON?.() || { groupId: group.groupId, name: group.name } : { groupId },
            invitedByUserId: userId,
          },
          dedupeKey: `group-invite:${groupId}:${invitedUser.id}`,
        });
      } catch {
        // notifications are best-effort
      }

      return res.status(201).json(membership);
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  async acceptInvite(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      if (!groupId) return res.status(400).json({ error: 'Invalid group id' });

      const membership = await getAnyMembership(groupId, userId);
      if (!membership || membership.status !== 'INVITED') {
        return res.status(404).json({ error: 'Invite not found' });
      }

      membership.status = 'ACTIVE';
      await membership.save();
      return res.json(membership);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async declineInvite(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      if (!groupId) return res.status(400).json({ error: 'Invalid group id' });

      const membership = await getAnyMembership(groupId, userId);
      if (!membership || membership.status !== 'INVITED') {
        return res.status(404).json({ error: 'Invite not found' });
      }

      await membership.destroy();
      return res.json({ message: 'Invite declined' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getGroupDesks(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      if (!groupId) return res.status(400).json({ error: 'Invalid group id' });

      const role = await getMyGroupRole(groupId, userId);
      if (!role) return res.status(404).json({ error: 'Group not found' });

      const desks = await Desk.findAll({
        where: { groupId },
        include: [{ model: Project }],
        order: [['deskId', 'DESC']],
      });

      return res.json({
        groupId,
        myRole: role,
        canManage: canManageGroup(role),
        desks,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async createGroupDesk(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      if (!groupId) return res.status(400).json({ error: 'Invalid group id' });

      const role = await getMyGroupRole(groupId, userId);
      if (!role) return res.status(404).json({ error: 'Group not found' });
      if (!canManageGroup(role)) return res.status(403).json({ error: 'Forbidden' });

      const { name, description, type } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Name is required' });

      const desk = await Desk.create({
        name,
        description,
        type,
        userId, // creator
        groupId,
      });

      return res.status(201).json(desk);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Owner can promote/demote members to ADMIN.
  async setMemberRole(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      const targetUserId = Number(req.params.userId);
      if (!groupId || !targetUserId) return res.status(400).json({ error: 'Invalid id' });

      const myRole = await getMyGroupRole(groupId, userId);
      if (!myRole) return res.status(404).json({ error: 'Group not found' });
      if (!isOwner(myRole)) return res.status(403).json({ error: 'Forbidden' });

      const { role } = req.body || {};
      if (!role || !['ADMIN', 'MEMBER'].includes(role)) {
        return res.status(400).json({ error: 'role must be ADMIN or MEMBER' });
      }

      const membership = await GroupMember.findOne({
        where: { groupId, userId: targetUserId, status: 'ACTIVE' },
      });
      if (!membership) return res.status(404).json({ error: 'Member not found' });
      if (membership.role === 'OWNER') return res.status(400).json({ error: 'Cannot change owner role' });

      membership.role = role;
      await membership.save();
      return res.json(membership);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async removeMember(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = Number(req.params.id);
      const targetUserId = Number(req.params.userId);
      if (!groupId || !targetUserId) return res.status(400).json({ error: 'Invalid id' });

      const myRole = await getMyGroupRole(groupId, userId);
      if (!myRole) return res.status(404).json({ error: 'Group not found' });

      const membership = await GroupMember.findOne({
        where: { groupId, userId: targetUserId, status: { [Op.in]: ['ACTIVE', 'INVITED'] } },
      });
      if (!membership) return res.status(404).json({ error: 'Member not found' });
      if (membership.role === 'OWNER') return res.status(400).json({ error: 'Cannot remove owner' });

      const isSelf = targetUserId === userId;
      if (isSelf) {
        // Members can leave group; owner cannot leave without deleting/transferring ownership.
        if (isOwner(myRole)) return res.status(400).json({ error: 'Owner cannot leave the group' });
        await membership.destroy();
        return res.json({ message: 'Left group' });
      }

      // Removing others requires elevated rights.
      if (!canManageGroup(myRole)) return res.status(403).json({ error: 'Forbidden' });
      if (isAdmin(myRole) && membership.role !== 'MEMBER') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await membership.destroy();
      return res.json({ message: 'Member removed' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Join group by inviteCode (shareable identifier).
  async joinByCode(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const codeRaw = req.body?.code ?? req.body?.inviteCode ?? '';
      const code = String(codeRaw || '').trim().toUpperCase();
      if (!code) {
        await t.rollback();
        return res.status(400).json({ error: 'code is required' });
      }

      const group = await Group.findOne({ where: { inviteCode: code }, transaction: t });
      if (!group) {
        await t.rollback();
        return res.status(404).json({ error: 'Group not found' });
      }

      const groupId = group.groupId;
      const existing = await GroupMember.findOne({ where: { groupId, userId }, transaction: t });

      if (existing) {
        if (existing.status === 'INVITED') {
          await t.rollback();
          return res.status(409).json({ error: 'You already have an invite to this group. Accept it from Invitations.' });
        }
        await t.commit();
        return res.json({ group: group.toJSON(), membership: existing.toJSON() });
      }

      const membership = await GroupMember.create(
        { groupId, userId, role: 'MEMBER', status: 'REQUESTED' },
        { transaction: t }
      );

      await t.commit();
      return res.status(201).json({ group: group.toJSON(), membership: membership.toJSON() });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  async regenerateInviteCode(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const groupId = Number(req.params.id);
      if (!groupId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid group id' });
      }

      const myRole = await getMyGroupRole(groupId, userId);
      if (!myRole) {
        await t.rollback();
        return res.status(404).json({ error: 'Group not found' });
      }
      if (!canManageGroup(myRole)) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden' });
      }

      const group = await Group.findByPk(groupId, { transaction: t });
      if (!group) {
        await t.rollback();
        return res.status(404).json({ error: 'Group not found' });
      }

      let tries = 0;
      while (tries < 10) {
        tries += 1;
        const code = makeInviteCode(10);
        try {
          group.inviteCode = code;
          // eslint-disable-next-line no-await-in-loop
          await group.save({ transaction: t });
          await t.commit();
          return res.json({ inviteCode: group.inviteCode });
        } catch (e) {
          const msg = String(e?.message || '');
          if (msg.toLowerCase().includes('invitecode') && (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate'))) {
            continue;
          }
          throw e;
        }
      }

      await t.rollback();
      return res.status(500).json({ error: 'Failed to generate invite code' });
    } catch (e) {
      await t.rollback();
      return res.status(500).json({ error: e.message });
    }
  }
}

module.exports = new GroupsController();


