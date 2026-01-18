const { Op } = require('sequelize');
const sequelize = require('../db');
const {
  CalendarEvent,
  CalendarGroupPeriod,
  CalendarGroupPeriodInvite,
  CalendarMyEvent,
  CalendarEventInvite,
  CalendarNotificationLog,
  Group,
  GroupMember,
} = require('../models/models');
const { getGroupRole } = require('../utils/deskAccess');

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function requireAuth(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Not authorized' });
    return null;
  }
  return userId;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function getMonthRange(monthStr) {
  const m = String(monthStr || '').trim();
  const match = m.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 1, 0, 0, 0, 0);
  return { from, to };
}

function normalizeEventInvite(row) {
  const invite = row?.toJSON ? row.toJSON() : row;
  const ev = invite?.calendar_event || invite?.CalendarEvent || invite?.event || invite?.calendarEvent;
  const group = ev?.group || ev?.Group;
  return {
    inviteId: invite?.id,
    status: invite?.status,
    respondedAt: invite?.respondedAt,
    event: ev
      ? {
          eventId: ev.eventId,
          groupId: ev.groupId,
          type: ev.type,
          title: ev.title,
          subject: ev.subject,
          description: ev.description,
          startsAt: ev.startsAt,
          endsAt: ev.endsAt,
          allDay: ev.allDay,
          group: group ? { groupId: group.groupId, name: group.name } : undefined,
        }
      : null,
  };
}

function normalizePeriodInvite(row) {
  const invite = row?.toJSON ? row.toJSON() : row;
  const p = invite?.calendar_group_period || invite?.CalendarGroupPeriod || invite?.period || invite?.calendarGroupPeriod;
  const group = p?.group || p?.Group;
  return {
    inviteId: invite?.id,
    status: invite?.status,
    respondedAt: invite?.respondedAt,
    period: p
      ? {
          periodId: p.periodId,
          groupId: p.groupId,
          type: p.type,
          title: p.title,
          description: p.description,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          allDay: p.allDay,
          group: group ? { groupId: group.groupId, name: group.name } : undefined,
        }
      : null,
  };
}

function normalizeMyEvent(row) {
  const ev = row?.toJSON ? row.toJSON() : row;
  return {
    myEventId: ev?.id,
    type: ev?.type,
    title: ev?.title,
    subject: ev?.subject,
    description: ev?.description,
    startsAt: ev?.startsAt,
    endsAt: ev?.endsAt,
    allDay: ev?.allDay,
  };
}

class CalendarController {
  // Student calendar for a date range (default: current month)
  async getMyCalendar(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = toInt(req.query.groupId);

      let from = parseDate(req.query.from);
      let to = parseDate(req.query.to);
      if (!from || !to) {
        const month = req.query.month;
        const r = getMonthRange(month) || getMonthRange(new Date().toISOString().slice(0, 7));
        from = r.from;
        to = r.to;
      }

      const myEvents = await CalendarMyEvent.findAll({
        where: { userId, startsAt: { [Op.gte]: from, [Op.lt]: to } },
        order: [['startsAt', 'ASC'], ['id', 'ASC']],
      });

      // Confirmed/declined events are filtered to the requested month/range (for grid rendering),
      // but PENDING invites should be returned for ALL months so students can accept anytime.
      const eventWhere = {
        startsAt: { [Op.gte]: from, [Op.lt]: to },
      };
      if (groupId) eventWhere.groupId = groupId;

      const invites = await CalendarEventInvite.findAll({
        where: { userId },
        include: [
          {
            model: CalendarEvent,
            required: true,
            where: eventWhere,
            include: [{ model: Group, attributes: ['groupId', 'name'] }],
          },
        ],
        order: [[CalendarEvent, 'startsAt', 'ASC'], ['id', 'ASC']],
      });

      const pendingEventWhere = {};
      if (groupId) pendingEventWhere.groupId = groupId;

      const pendingInvitesAll = await CalendarEventInvite.findAll({
        where: { userId, status: 'PENDING' },
        include: [
          {
            model: CalendarEvent,
            required: true,
            where: pendingEventWhere,
            include: [{ model: Group, attributes: ['groupId', 'name'] }],
          },
        ],
        order: [[CalendarEvent, 'startsAt', 'ASC'], ['id', 'ASC']],
      });

      // Periods can span months, so we include anything that overlaps the requested range.
      const periodWhere = {
        [Op.and]: [{ startsAt: { [Op.lt]: to } }, { endsAt: { [Op.gte]: from } }],
      };
      if (groupId) periodWhere.groupId = groupId;

      const periodInvites = await CalendarGroupPeriodInvite.findAll({
        where: { userId },
        include: [
          {
            model: CalendarGroupPeriod,
            required: true,
            where: periodWhere,
            include: [{ model: Group, attributes: ['groupId', 'name'] }],
          },
        ],
        order: [[CalendarGroupPeriod, 'startsAt', 'ASC'], ['id', 'ASC']],
      });

      const pendingPeriodWhere = {};
      if (groupId) pendingPeriodWhere.groupId = groupId;

      const pendingPeriodInvitesAll = await CalendarGroupPeriodInvite.findAll({
        where: { userId, status: 'PENDING' },
        include: [
          {
            model: CalendarGroupPeriod,
            required: true,
            where: pendingPeriodWhere,
            include: [{ model: Group, attributes: ['groupId', 'name'] }],
          },
        ],
        order: [[CalendarGroupPeriod, 'startsAt', 'ASC'], ['id', 'ASC']],
      });

      const normalized = invites.map(normalizeEventInvite).filter((x) => x.event);
      const confirmed = normalized.filter((x) => x.status === 'CONFIRMED');
      const declined = normalized.filter((x) => x.status === 'DECLINED');

      const pending = pendingInvitesAll.map(normalizeEventInvite).filter((x) => x.event);

      const normalizedPeriods = periodInvites.map(normalizePeriodInvite).filter((x) => x.period);
      const confirmedPeriods = normalizedPeriods.filter((x) => x.status === 'CONFIRMED');
      const declinedPeriods = normalizedPeriods.filter((x) => x.status === 'DECLINED');

      const pendingPeriods = pendingPeriodInvitesAll.map(normalizePeriodInvite).filter((x) => x.period);

      return res.json({
        range: { from, to },
        groupId: groupId || null,
        myEvents: myEvents.map(normalizeMyEvent),
        confirmed,
        pending,
        declined,
        confirmedPeriods,
        pendingPeriods,
        declinedPeriods,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Student creates personal event (only in their calendar).
  async createMyEvent(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const title = String(req.body?.title || '').trim();
      if (!title) {
        await t.rollback();
        return res.status(400).json({ error: 'title is required' });
      }

      const type = String(req.body?.type || 'CT').toUpperCase();
      const allowedTypes = new Set(['CT', 'COLLOQUIUM', 'EXAM', 'DEADLINE']);
      if (!allowedTypes.has(type)) {
        await t.rollback();
        return res.status(400).json({ error: `type must be one of: ${Array.from(allowedTypes).join(', ')}` });
      }

      const startsAt = parseDate(req.body?.startsAt || req.body?.date);
      if (!startsAt) {
        await t.rollback();
        return res.status(400).json({ error: 'startsAt (or date) is required (ISO string)' });
      }

      const endsAt = parseDate(req.body?.endsAt);
      const allDay = req.body?.allDay === undefined ? true : Boolean(req.body?.allDay);

      const subject = req.body?.subject != null ? String(req.body.subject).trim() : null;
      const description = req.body?.description != null ? String(req.body.description).trim() : null;

      const ev = await CalendarMyEvent.create(
        {
          userId,
          type,
          title,
          subject: subject || null,
          description: description || null,
          startsAt,
          endsAt: endsAt || null,
          allDay,
        },
        { transaction: t }
      );

      await t.commit();
      return res.status(201).json(normalizeMyEvent(ev));
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  // Student deletes personal event (only from their calendar). No confirmation here.
  async deleteMyEvent(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const myEventId = toInt(req.params.myEventId);
      if (!myEventId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid myEventId' });
      }

      const ev = await CalendarMyEvent.findOne({ where: { id: myEventId, userId }, transaction: t });
      if (!ev) {
        await t.rollback();
        return res.status(404).json({ error: 'Event not found' });
      }

      await ev.destroy({ transaction: t });
      await t.commit();
      return res.json({ ok: true, myEventId });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  // Student confirms/declines a group period invite.
  async respondToPeriodInvite(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const inviteId = toInt(req.params.inviteId);
      if (!inviteId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid inviteId' });
      }

      const status = String(req.body?.status || '').toUpperCase();
      if (!['CONFIRMED', 'DECLINED'].includes(status)) {
        await t.rollback();
        return res.status(400).json({ error: 'status must be CONFIRMED or DECLINED' });
      }

      const invite = await CalendarGroupPeriodInvite.findOne({ where: { id: inviteId, userId }, transaction: t });
      if (!invite) {
        await t.rollback();
        return res.status(404).json({ error: 'Invite not found' });
      }

      await invite.update({ status, respondedAt: new Date() }, { transaction: t });
      await t.commit();

      return res.json({ ok: true, inviteId, status });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  // Student confirms/declines an invite => event appears in their calendar
  async respondToInvite(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const inviteId = toInt(req.params.inviteId);
      if (!inviteId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid inviteId' });
      }

      const status = String(req.body?.status || '').toUpperCase();
      if (!['CONFIRMED', 'DECLINED'].includes(status)) {
        await t.rollback();
        return res.status(400).json({ error: 'status must be CONFIRMED or DECLINED' });
      }

      const invite = await CalendarEventInvite.findOne({ where: { id: inviteId, userId }, transaction: t });
      if (!invite) {
        await t.rollback();
        return res.status(404).json({ error: 'Invite not found' });
      }

      await invite.update({ status, respondedAt: new Date() }, { transaction: t });
      await t.commit();

      return res.json({ ok: true, inviteId, status });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  // Starosta/Admin creates group event => students receive PENDING invites
  async createGroupEvent(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const groupId = toInt(req.params.groupId);
      if (!groupId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid groupId' });
      }

      const role = await getGroupRole(groupId, userId);
      if (!(role === 'OWNER' || role === 'ADMIN')) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden' });
      }

      const title = String(req.body?.title || '').trim();
      if (!title) {
        await t.rollback();
        return res.status(400).json({ error: 'title is required' });
      }

      const type = String(req.body?.type || 'CT').toUpperCase();
      const allowedTypes = new Set(['CT', 'COLLOQUIUM', 'EXAM', 'DEADLINE']);
      if (!allowedTypes.has(type)) {
        await t.rollback();
        return res.status(400).json({ error: `type must be one of: ${Array.from(allowedTypes).join(', ')}` });
      }

      const startsAt = parseDate(req.body?.startsAt || req.body?.date);
      if (!startsAt) {
        await t.rollback();
        return res.status(400).json({ error: 'startsAt (or date) is required (ISO string)' });
      }

      const endsAt = parseDate(req.body?.endsAt);
      const allDay = req.body?.allDay === undefined ? true : Boolean(req.body?.allDay);

      const subject = req.body?.subject != null ? String(req.body.subject).trim() : null;
      const description = req.body?.description != null ? String(req.body.description).trim() : null;

      const event = await CalendarEvent.create(
        {
          groupId,
          createdBy: userId,
          type,
          title,
          subject: subject || null,
          description: description || null,
          startsAt,
          endsAt: endsAt || null,
          allDay,
        },
        { transaction: t }
      );

      const members = await GroupMember.findAll({
        where: { groupId, status: 'ACTIVE' },
        transaction: t,
      });

      const now = new Date();
      const invitesPayload = members.map((m) => ({
        eventId: event.eventId,
        userId: m.userId,
        status: m.userId === userId ? 'CONFIRMED' : 'PENDING',
        respondedAt: m.userId === userId ? now : null,
      }));

      if (invitesPayload.length) {
        await CalendarEventInvite.bulkCreate(invitesPayload, { transaction: t });
      }

      await t.commit();

      return res.status(201).json({
        ...event.toJSON(),
        invitesCreated: invitesPayload.length,
      });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  // Starosta/Admin creates group period => students receive PENDING invites
  async createGroupPeriod(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const groupId = toInt(req.params.groupId);
      if (!groupId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid groupId' });
      }

      const role = await getGroupRole(groupId, userId);
      if (!(role === 'OWNER' || role === 'ADMIN')) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden' });
      }

      const type = String(req.body?.type || '').toUpperCase();
      const allowedTypes = new Set(['SEMESTER', 'SESSION', 'VACATION']);
      if (!allowedTypes.has(type)) {
        await t.rollback();
        return res.status(400).json({ error: `type must be one of: ${Array.from(allowedTypes).join(', ')}` });
      }

      const title = String(req.body?.title || '').trim() || (type === 'SEMESTER' ? 'Семестр' : type === 'SESSION' ? 'Сессия' : 'Каникулы');

      const startsAt = parseDate(req.body?.startsAt);
      const endsAt = parseDate(req.body?.endsAt);
      if (!startsAt || !endsAt) {
        await t.rollback();
        return res.status(400).json({ error: 'startsAt and endsAt are required (ISO strings)' });
      }
      if (endsAt < startsAt) {
        await t.rollback();
        return res.status(400).json({ error: 'endsAt must be >= startsAt' });
      }

      const description = req.body?.description != null ? String(req.body.description).trim() : null;
      const allDay = req.body?.allDay === undefined ? true : Boolean(req.body?.allDay);

      const period = await CalendarGroupPeriod.create(
        {
          groupId,
          createdBy: userId,
          type,
          title,
          description: description || null,
          startsAt,
          endsAt,
          allDay,
        },
        { transaction: t }
      );

      const members = await GroupMember.findAll({
        where: { groupId, status: 'ACTIVE' },
        transaction: t,
      });

      const now = new Date();
      const invitesPayload = members.map((m) => ({
        periodId: period.periodId,
        userId: m.userId,
        status: m.userId === userId ? 'CONFIRMED' : 'PENDING',
        respondedAt: m.userId === userId ? now : null,
      }));

      if (invitesPayload.length) {
        await CalendarGroupPeriodInvite.bulkCreate(invitesPayload, { transaction: t });
      }

      await t.commit();
      return res.status(201).json({
        ...period.toJSON(),
        invitesCreated: invitesPayload.length,
      });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  // Admin view: periods + confirmation stats
  async getGroupPeriods(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = toInt(req.params.groupId);
      if (!groupId) return res.status(400).json({ error: 'Invalid groupId' });

      const role = await getGroupRole(groupId, userId);
      if (!(role === 'OWNER' || role === 'ADMIN')) return res.status(403).json({ error: 'Forbidden' });

      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      const monthRange = !from || !to ? getMonthRange(req.query.month) : null;

      const where = { groupId };
      const rangeFrom = from || monthRange?.from;
      const rangeTo = to || monthRange?.to;
      if (rangeFrom && rangeTo) {
        where[Op.and] = [{ startsAt: { [Op.lt]: rangeTo } }, { endsAt: { [Op.gte]: rangeFrom } }];
      }

      const periods = await CalendarGroupPeriod.findAll({
        where,
        include: [{ model: CalendarGroupPeriodInvite, attributes: ['status'], required: false }],
        order: [['startsAt', 'ASC'], ['periodId', 'ASC']],
      });

      const payload = periods.map((p) => {
        const row = p.toJSON();
        const invites = Array.isArray(row.calendar_group_period_invites) ? row.calendar_group_period_invites : [];
        const stats = invites.reduce(
          (acc, i) => {
            const s = i.status || 'PENDING';
            acc.total += 1;
            if (s === 'CONFIRMED') acc.confirmed += 1;
            else if (s === 'DECLINED') acc.declined += 1;
            else acc.pending += 1;
            return acc;
          },
          { total: 0, confirmed: 0, declined: 0, pending: 0 }
        );
        delete row.calendar_group_period_invites;
        return { ...row, stats };
      });

      return res.json({ groupId, periods: payload });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async deleteGroupPeriod(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const groupId = toInt(req.params.groupId);
      if (!groupId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid groupId' });
      }

      const role = await getGroupRole(groupId, userId);
      if (!(role === 'OWNER' || role === 'ADMIN')) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden' });
      }

      const periodId = toInt(req.params.periodId);
      if (!periodId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid periodId' });
      }

      const period = await CalendarGroupPeriod.findOne({ where: { periodId, groupId }, transaction: t });
      if (!period) {
        await t.rollback();
        return res.status(404).json({ error: 'Period not found' });
      }

      await period.destroy({ transaction: t });
      await t.commit();
      return res.json({ ok: true, periodId });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  async deleteGroupEvent(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = requireAuth(req, res);
      if (!userId) {
        await t.rollback();
        return;
      }

      const groupId = toInt(req.params.groupId);
      if (!groupId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid groupId' });
      }

      const role = await getGroupRole(groupId, userId);
      if (!(role === 'OWNER' || role === 'ADMIN')) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden' });
      }

      const eventId = toInt(req.params.eventId);
      if (!eventId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid eventId' });
      }

      const event = await CalendarEvent.findOne({ where: { eventId, groupId }, transaction: t });
      if (!event) {
        await t.rollback();
        return res.status(404).json({ error: 'Event not found' });
      }

      await event.destroy({ transaction: t });
      await t.commit();
      return res.json({ ok: true, eventId });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  // Admin view: events + confirmation stats
  async getGroupEvents(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = toInt(req.params.groupId);
      if (!groupId) return res.status(400).json({ error: 'Invalid groupId' });

      const role = await getGroupRole(groupId, userId);
      if (!(role === 'OWNER' || role === 'ADMIN')) return res.status(403).json({ error: 'Forbidden' });

      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      const monthRange = !from || !to ? getMonthRange(req.query.month) : null;

      const where = { groupId };
      const rangeFrom = from || monthRange?.from;
      const rangeTo = to || monthRange?.to;
      if (rangeFrom && rangeTo) where.startsAt = { [Op.gte]: rangeFrom, [Op.lt]: rangeTo };

      const events = await CalendarEvent.findAll({
        where,
        include: [{ model: CalendarEventInvite, attributes: ['status'], required: false }],
        order: [['startsAt', 'ASC'], ['eventId', 'ASC']],
      });

      const payload = events.map((e) => {
        const ev = e.toJSON();
        const invites = Array.isArray(ev.calendar_event_invites) ? ev.calendar_event_invites : [];
        const stats = invites.reduce(
          (acc, i) => {
            const s = i.status || 'PENDING';
            acc.total += 1;
            if (s === 'CONFIRMED') acc.confirmed += 1;
            else if (s === 'DECLINED') acc.declined += 1;
            else acc.pending += 1;
            return acc;
          },
          { total: 0, confirmed: 0, declined: 0, pending: 0 }
        );
        delete ev.calendar_event_invites;
        return { ...ev, stats };
      });

      return res.json({ groupId, events: payload });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // (Optional) Admin can clear notification logs for a user/event (dev helper)
  async _debugClearNotificationLogs(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const groupId = toInt(req.params.groupId);
      if (!groupId) return res.status(400).json({ error: 'Invalid groupId' });

      const role = await getGroupRole(groupId, userId);
      if (!(role === 'OWNER' || role === 'ADMIN')) return res.status(403).json({ error: 'Forbidden' });

      const eventId = toInt(req.query.eventId);
      if (!eventId) return res.status(400).json({ error: 'eventId is required' });

      await CalendarNotificationLog.destroy({ where: { eventId } });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new CalendarController();


