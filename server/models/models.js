const sequelize = require('../db');
const { DataTypes } = require('sequelize');

const User = sequelize.define('user', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'USER', allowNull: false },
});

const Group = sequelize.define('group', {
  groupId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, unique: true, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
});

// Users <-> Groups membership (roles inside a group)
const GroupMember = sequelize.define(
  'group_member',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    groupId: { type: DataTypes.INTEGER, allowNull: false, references: { model: Group, key: 'groupId' } },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'MEMBER',
      validate: { isIn: [['OWNER', 'ADMIN', 'MEMBER']] },
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'ACTIVE',
      validate: { isIn: [['ACTIVE', 'INVITED']] },
    },
  },
  {
    indexes: [{ unique: true, fields: ['groupId', 'userId'] }],
  }
);

const Desk = sequelize.define('desk', {
  deskId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: true },
  type: { type: DataTypes.STRING, allowNull: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
  groupId: { type: DataTypes.INTEGER, allowNull: true, references: { model: Group, key: 'groupId' } },
});

const Element = sequelize.define('element', {
  elementId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isIn: [['note', 'text', 'document', 'link', 'drawing']] },
  },
  x: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  y: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  width: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 240 },
  height: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 160 },
  rotation: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  zIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Emoji reactions: { "😍": [1,2], "😎": [5] }
  reactions: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  deskId: { type: DataTypes.INTEGER, allowNull: false, references: { model: Desk, key: 'deskId' } },
});

const Note = sequelize.define('note', {
  elementId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    references: { model: Element, key: 'elementId' },
  },
  text: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
});

// History of note versions for collaboration / restore.
const NoteVersion = sequelize.define(
  'note_version',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    elementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Element, key: 'elementId' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    version: { type: DataTypes.INTEGER, allowNull: false },
    text: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: User, key: 'id' } },
    changeType: { type: DataTypes.STRING, allowNull: false, defaultValue: 'EDIT' },
  },
  {
    indexes: [
      { unique: true, fields: ['elementId', 'version'] },
      { fields: ['elementId'] },
      { fields: ['createdAt'] },
    ],
  }
);

const Text = sequelize.define('text', {
  elementId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    references: { model: Element, key: 'elementId' },
  },
  content: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  fontFamily: { type: DataTypes.STRING, allowNull: true },
  fontSize: { type: DataTypes.INTEGER, allowNull: true },
  color: { type: DataTypes.STRING, allowNull: true },
});

const Document = sequelize.define('document', {
  elementId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    references: { model: Element, key: 'elementId' },
  },
  title: { type: DataTypes.STRING, allowNull: true },
  url: { type: DataTypes.TEXT, allowNull: false },
});

const Link = sequelize.define('link', {
  elementId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    references: { model: Element, key: 'elementId' },
  },
  title: { type: DataTypes.STRING, allowNull: true },
  url: { type: DataTypes.TEXT, allowNull: false },
  previewImageUrl: { type: DataTypes.TEXT, allowNull: true },
});

const Drawing = sequelize.define('drawing', {
  elementId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    references: { model: Element, key: 'elementId' },
  },
  // Store vector strokes or serialized canvas JSON.
  data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
});

// Element comments (thread per element).
const Comment = sequelize.define(
  'comment',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    deskId: { type: DataTypes.INTEGER, allowNull: false, references: { model: Desk, key: 'deskId' } },
    elementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Element, key: 'elementId' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    text: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  },
  {
    indexes: [{ fields: ['deskId', 'elementId', 'createdAt'] }, { fields: ['elementId'] }, { fields: ['deskId'] }],
  }
);

// --- Calendar (group events -> student confirmation -> notifications) ---
const CalendarEvent = sequelize.define('calendar_event', {
  eventId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  groupId: { type: DataTypes.INTEGER, allowNull: false, references: { model: Group, key: 'groupId' } },
  createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: User, key: 'id' } },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'CT',
    validate: {
      isIn: [[
        'CT',
        'COLLOQUIUM',
        'EXAM',
        'DEADLINE',
      ]],
    },
  },
  title: { type: DataTypes.STRING, allowNull: false },
  subject: { type: DataTypes.STRING, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  startsAt: { type: DataTypes.DATE, allowNull: false },
  endsAt: { type: DataTypes.DATE, allowNull: true },
  allDay: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
});

// Group periods (semester/session/vacation) set by starosta/admin.
// Students receive invites and confirm adding to their calendar (same flow as events).
const CalendarGroupPeriod = sequelize.define(
  'calendar_group_period',
  {
    periodId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    groupId: { type: DataTypes.INTEGER, allowNull: false, references: { model: Group, key: 'groupId' } },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: User, key: 'id' } },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [['SEMESTER', 'SESSION', 'VACATION']] },
    },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    startsAt: { type: DataTypes.DATE, allowNull: false },
    endsAt: { type: DataTypes.DATE, allowNull: false },
    allDay: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    indexes: [{ fields: ['groupId', 'startsAt'] }],
  }
);

const CalendarGroupPeriodInvite = sequelize.define(
  'calendar_group_period_invite',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    periodId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: CalendarGroupPeriod, key: 'periodId' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'PENDING',
      validate: { isIn: [['PENDING', 'CONFIRMED', 'DECLINED']] },
    },
    respondedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [{ unique: true, fields: ['periodId', 'userId'] }, { fields: ['userId', 'status'] }],
  }
);

// Student personal events (belong only to student's calendar; no invites).
const CalendarMyEvent = sequelize.define(
  'calendar_my_event',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'CT',
      validate: { isIn: [['CT', 'COLLOQUIUM', 'EXAM', 'DEADLINE']] },
    },
    title: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    startsAt: { type: DataTypes.DATE, allowNull: false },
    endsAt: { type: DataTypes.DATE, allowNull: true },
    allDay: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    indexes: [{ fields: ['userId', 'startsAt'] }],
  }
);

const CalendarEventInvite = sequelize.define(
  'calendar_event_invite',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    eventId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: CalendarEvent, key: 'eventId' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'PENDING',
      validate: { isIn: [['PENDING', 'CONFIRMED', 'DECLINED']] },
    },
    respondedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [{ unique: true, fields: ['eventId', 'userId'] }, { fields: ['userId', 'status'] }],
  }
);

const CalendarNotificationLog = sequelize.define(
  'calendar_notification_log',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    eventId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: CalendarEvent, key: 'eventId' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    kind: { type: DataTypes.STRING, allowNull: false }, // 'D7' | 'D3' | 'H24'
    sentAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    indexes: [{ unique: true, fields: ['eventId', 'userId', 'kind'] }, { fields: ['userId', 'sentAt'] }],
  }
);


// --- Relationships ---
User.hasMany(Desk, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Desk.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Group, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Group.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(GroupMember, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
GroupMember.belongsTo(User, { foreignKey: 'userId' });

Group.hasMany(GroupMember, { foreignKey: 'groupId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
GroupMember.belongsTo(Group, { foreignKey: 'groupId' });

User.belongsToMany(Group, { through: GroupMember, foreignKey: 'userId', otherKey: 'groupId' });
Group.belongsToMany(User, { through: GroupMember, foreignKey: 'groupId', otherKey: 'userId' });

Group.hasMany(Desk, { foreignKey: 'groupId', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
Desk.belongsTo(Group, { foreignKey: 'groupId' });

Desk.hasMany(Element, { foreignKey: 'deskId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Element.belongsTo(Desk, { foreignKey: 'deskId' });

Element.hasOne(Note, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Note.belongsTo(Element, { foreignKey: 'elementId' });

Element.hasMany(NoteVersion, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
NoteVersion.belongsTo(Element, { foreignKey: 'elementId' });

User.hasMany(NoteVersion, { foreignKey: 'updatedBy', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
NoteVersion.belongsTo(User, { foreignKey: 'updatedBy' });

Element.hasOne(Text, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Text.belongsTo(Element, { foreignKey: 'elementId' });

Element.hasOne(Document, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Document.belongsTo(Element, { foreignKey: 'elementId' });

Element.hasOne(Link, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Link.belongsTo(Element, { foreignKey: 'elementId' });

Element.hasOne(Drawing, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Drawing.belongsTo(Element, { foreignKey: 'elementId' });

Desk.hasMany(Comment, { foreignKey: 'deskId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Comment.belongsTo(Desk, { foreignKey: 'deskId' });

Element.hasMany(Comment, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Comment.belongsTo(Element, { foreignKey: 'elementId' });

User.hasMany(Comment, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Comment.belongsTo(User, { foreignKey: 'userId' });

Group.hasMany(CalendarEvent, { foreignKey: 'groupId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CalendarEvent.belongsTo(Group, { foreignKey: 'groupId' });

User.hasMany(CalendarEvent, { foreignKey: 'createdBy', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
CalendarEvent.belongsTo(User, { foreignKey: 'createdBy' });

Group.hasMany(CalendarGroupPeriod, { foreignKey: 'groupId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CalendarGroupPeriod.belongsTo(Group, { foreignKey: 'groupId' });

User.hasMany(CalendarGroupPeriod, { foreignKey: 'createdBy', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
CalendarGroupPeriod.belongsTo(User, { foreignKey: 'createdBy' });

CalendarGroupPeriod.hasMany(CalendarGroupPeriodInvite, { foreignKey: 'periodId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CalendarGroupPeriodInvite.belongsTo(CalendarGroupPeriod, { foreignKey: 'periodId' });

User.hasMany(CalendarGroupPeriodInvite, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CalendarGroupPeriodInvite.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(CalendarMyEvent, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CalendarMyEvent.belongsTo(User, { foreignKey: 'userId' });

CalendarEvent.hasMany(CalendarEventInvite, { foreignKey: 'eventId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CalendarEventInvite.belongsTo(CalendarEvent, { foreignKey: 'eventId' });

User.hasMany(CalendarEventInvite, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CalendarEventInvite.belongsTo(User, { foreignKey: 'userId' });

CalendarEvent.hasMany(CalendarNotificationLog, { foreignKey: 'eventId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CalendarNotificationLog.belongsTo(CalendarEvent, { foreignKey: 'eventId' });

User.hasMany(CalendarNotificationLog, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CalendarNotificationLog.belongsTo(User, { foreignKey: 'userId' });

module.exports = {
  User,
  Desk,
  Group,
  GroupMember,
  Element,
  Note,
  NoteVersion,
  Text,
  Document,
  Link,
  Drawing,
  Comment,
  CalendarEvent,
  CalendarGroupPeriod,
  CalendarGroupPeriodInvite,
  CalendarMyEvent,
  CalendarEventInvite,
  CalendarNotificationLog,
};