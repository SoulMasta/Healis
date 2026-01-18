const { Op } = require('sequelize');
const { CalendarEventInvite, CalendarEvent, CalendarNotificationLog, Group } = require('../models/models');
const { emitToUser } = require('../realtime/bus');

const THRESHOLDS = [
  { kind: 'D7', ms: 7 * 24 * 60 * 60 * 1000 },
  { kind: 'D3', ms: 3 * 24 * 60 * 60 * 1000 },
  { kind: 'H24', ms: 24 * 60 * 60 * 1000 },
];

async function tick({ intervalMs }) {
  const now = Date.now();
  const nowDate = new Date(now);
  const lookaheadMs = THRESHOLDS.reduce((m, t) => Math.max(m, t.ms), 0) + intervalMs + 5_000;
  const maxDate = new Date(now + lookaheadMs);

  // Only confirmed events in the future and within the lookahead window.
  const invites = await CalendarEventInvite.findAll({
    where: { status: 'CONFIRMED' },
    include: [
      {
        model: CalendarEvent,
        required: true,
        where: { startsAt: { [Op.gt]: nowDate, [Op.lte]: maxDate } },
        include: [{ model: Group, attributes: ['groupId', 'name'] }],
      },
    ],
    order: [[CalendarEvent, 'startsAt', 'ASC']],
  });

  for (const row of invites) {
    const invite = row?.toJSON ? row.toJSON() : row;
    const ev = invite?.calendar_event || invite?.CalendarEvent;
    if (!ev?.startsAt) continue;

    const eventStartsAt = new Date(ev.startsAt).getTime();
    const delta = eventStartsAt - now;
    if (!(delta > 0)) continue;

    for (const th of THRESHOLDS) {
      // Fire once when we cross the exact threshold (within the scheduler window).
      if (delta <= th.ms && delta > th.ms - intervalMs) {
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


