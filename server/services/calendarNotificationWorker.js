const { Op } = require('sequelize');
const { CalendarEventInvite, CalendarEvent, CalendarMyEvent, CalendarNotificationLog, Group } = require('../models/models');
const { emitToUser } = require('../realtime/bus');
const { createNotificationForUser } = require('./notificationService');

const THRESHOLDS = [
  { kind: 'D7', ms: 7 * 24 * 60 * 60 * 1000 },
  { kind: 'D3', ms: 3 * 24 * 60 * 60 * 1000 },
  { kind: 'H24', ms: 24 * 60 * 60 * 1000 },
];

async function tick({ intervalMs }) {
  const nowMs = Date.now();
  const now = new Date(nowMs);

  // Instead of scanning *all* upcoming invites each minute, query only a narrow window
  // around each threshold (e.g. exactly 24h before start, +/- interval jitter).
  for (const th of THRESHOLDS) {
    const from = new Date(nowMs + th.ms - intervalMs - 5_000);
    const to = new Date(nowMs + th.ms + 5_000);

    const invites = await CalendarEventInvite.findAll({
      where: { status: 'CONFIRMED' },
      include: [
        {
          model: CalendarEvent,
          required: true,
          where: { startsAt: { [Op.gt]: now, [Op.gte]: from, [Op.lte]: to } },
          include: [{ model: Group, attributes: ['groupId', 'name'] }],
        },
      ],
      order: [[CalendarEvent, 'startsAt', 'ASC']],
    });

    for (const row of invites) {
      const invite = row?.toJSON ? row.toJSON() : row;
      const ev = invite?.calendar_event || invite?.CalendarEvent;
      if (!ev?.startsAt) continue;

      try {
        await CalendarNotificationLog.create({
          eventId: ev.eventId,
          userId: invite.userId,
          kind: th.kind,
          sentAt: new Date(),
        });
      } catch (e) {
        // Unique constraint => already sent, ignore.
        if (e?.name === 'SequelizeUniqueConstraintError') continue;
        // eslint-disable-next-line no-console
        console.error('calendar notification log create failed:', e?.message || e);
        continue;
      }

      // Persist to notification inbox (so users see it even if offline).
      const group = ev.group ? { groupId: ev.group.groupId, name: ev.group.name } : undefined;
      const when =
        th.kind === 'D7' ? 'in 7 days' : th.kind === 'D3' ? 'in 3 days' : th.kind === 'H24' ? 'in 24 hours' : th.kind;
      await createNotificationForUser({
        userId: invite.userId,
        type: 'CALENDAR_EVENT',
        title: `Upcoming event (${when})`,
        body: String(ev.title || 'Event'),
        dedupeKey: `cal:${ev.eventId}:${invite.userId}:${th.kind}`,
        payload: {
          kind: th.kind,
          event: {
            eventId: ev.eventId,
            groupId: ev.groupId,
            type: ev.type,
            title: ev.title,
            subject: ev.subject,
            startsAt: ev.startsAt,
            allDay: ev.allDay,
            group,
          },
        },
      });

      emitToUser(invite.userId, 'calendar:notification', {
        kind: th.kind,
        userId: invite.userId,
        event: {
          eventId: ev.eventId,
          groupId: ev.groupId,
          type: ev.type,
          title: ev.title,
          subject: ev.subject,
          startsAt: ev.startsAt,
          allDay: ev.allDay,
          group: ev.group ? { groupId: ev.group.groupId, name: ev.group.name } : undefined,
        },
      });
    }

    // Personal (my) events: best-effort notifications too (uses Notification.dedupeKey instead of CalendarNotificationLog).
    // Note: This does not depend on group invites, so it works for user's own events.
    const myEvents = await CalendarMyEvent.findAll({
      where: { startsAt: { [Op.gt]: now, [Op.gte]: from, [Op.lte]: to } },
      order: [['startsAt', 'ASC'], ['id', 'ASC']],
    });

    for (const ev of myEvents) {
      const e = ev?.toJSON ? ev.toJSON() : ev;
      if (!e?.id || !e?.userId) continue;
      const when =
        th.kind === 'D7' ? 'in 7 days' : th.kind === 'D3' ? 'in 3 days' : th.kind === 'H24' ? 'in 24 hours' : th.kind;
      const dedupeKey = `cal:my:${e.id}:${e.userId}:${th.kind}`;
      await createNotificationForUser({
        userId: e.userId,
        type: 'CALENDAR_EVENT',
        title: `Upcoming event (${when})`,
        body: String(e.title || 'Event'),
        dedupeKey,
        payload: {
          kind: th.kind,
          event: {
            myEventId: e.id,
            type: e.type,
            title: e.title,
            subject: e.subject,
            startsAt: e.startsAt,
            allDay: e.allDay,
          },
        },
      });

      emitToUser(e.userId, 'calendar:notification', {
        kind: th.kind,
        userId: e.userId,
        event: {
          myEventId: e.id,
          type: e.type,
          title: e.title,
          subject: e.subject,
          startsAt: e.startsAt,
          allDay: e.allDay,
        },
      });
    }
  }
}

function startCalendarNotificationWorker({ intervalMs = 60_000 } = {}) {
  let timer = null;
  const run = async () => {
    try {
      await tick({ intervalMs });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('calendar notification worker tick failed:', e?.message || e);
    }
  };

  // Kick once shortly after boot, then on interval.
  setTimeout(run, 2_000);
  timer = setInterval(run, intervalMs);

  return {
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

module.exports = { startCalendarNotificationWorker };


