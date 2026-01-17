const { Op } = require('sequelize');
const sequelize = require('../db');
const { Group, GroupMember, User, Desk } = require('../models/models');

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

      const group = await Group.create(
        {
          name,
          description,
          userId,
        },
        { transaction: t }
      );

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

      const members = await GroupMember.findAll({
        where: { groupId },
        include: [{ model: User, attributes: ['id', 'email'] }],
        order: [['role', 'ASC'], ['id', 'ASC']],
      });

      return res.json(
        members.map((m) => ({
          id: m.id,
          groupId: m.groupId,
          userId: m.userId,
          role: m.role,
          status: m.status,
          user: m.user ? { id: m.user.id, email: m.user.email } : null,
        }))
      );
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

      const { email, userId: invitedUserIdRaw } = req.body || {};
      let invitedUser = null;
      if (invitedUserIdRaw) {
        invitedUser = await User.findByPk(invitedUserIdRaw);
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
}

module.exports = new GroupsController();


