const sequelize = require('../db');
const { DataTypes } = require('sequelize');

const User = sequelize.define('user', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'USER', allowNull: false },
  // Auth provider metadata (for Google sign-in / account linking).
  authProvider: { type: DataTypes.STRING, allowNull: false, defaultValue: 'local' }, // 'local' | 'google'
  googleSub: { type: DataTypes.STRING, unique: true, allowNull: true },
  emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Public profile fields
  // username is stored WITHOUT '@' (display as `@${username}` in UI).
  username: { type: DataTypes.STRING, unique: true, allowNull: true },
  nickname: { type: DataTypes.STRING, allowNull: true },
  // Student info (avoid collision with app Groups model)
  studyGroup: { type: DataTypes.STRING, allowNull: true },
  course: { type: DataTypes.INTEGER, allowNull: true },
  faculty: { type: DataTypes.STRING, allowNull: true },
  avatarUrl: { type: DataTypes.TEXT, allowNull: true },
});

// Long-lived refresh tokens (stored as hashes; raw tokens never stored in DB).
const RefreshToken = sequelize.define(
  'refresh_token',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    replacedByTokenHash: { type: DataTypes.STRING, allowNull: true },
    userAgent: { type: DataTypes.TEXT, allowNull: true },
    ip: { type: DataTypes.STRING, allowNull: true },
  },
  {
    indexes: [{ fields: ['userId'] }, { fields: ['expiresAt'] }],
  }
);

// User notifications (persistent inbox + realtime push).
const Notification = sequelize.define(
  'notification',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    type: { type: DataTypes.STRING, allowNull: false }, // e.g. 'CALENDAR_EVENT'
    title: { type: DataTypes.STRING, allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // Optional uniqueness key to prevent duplicates (e.g. calendar threshold notifications).
    dedupeKey: { type: DataTypes.STRING, allowNull: true, unique: true },
    readAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [{ fields: ['userId', 'createdAt'] }, { fields: ['userId', 'readAt'] }],
  }
);

const Group = sequelize.define('group', {
  groupId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, unique: true, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
  // Public join identifier (shareable). Can be NULL for legacy rows; server will backfill.
  inviteCode: { type: DataTypes.STRING, unique: true, allowNull: true },
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
      // ACTIVE: full member
      // INVITED: invited by owner/admin, must accept
      // REQUESTED: user requested to join by inviteCode, must be approved by owner/admin
      validate: { isIn: [['ACTIVE', 'INVITED', 'REQUESTED']] },
    },
  },
  {
    indexes: [{ unique: true, fields: ['groupId', 'userId'] }],
  }
);

// User projects (sidebar -> Проекты). Minimal MVP: name + owner.
const Project = sequelize.define(
  'project',
  {
    projectId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
  },
  {
    indexes: [{ fields: ['userId', 'createdAt'] }],
  }
);

const Desk = sequelize.define('desk', {
  deskId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: true },
  type: { type: DataTypes.STRING, allowNull: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
  groupId: { type: DataTypes.INTEGER, allowNull: true, references: { model: Group, key: 'groupId' } },
  projectId: { type: DataTypes.INTEGER, allowNull: true, references: { model: Project, key: 'projectId' } },
});

// Per-user "recently opened" desks (supports HomePage -> Последние доски).
const DeskRecent = sequelize.define(
  'desk_recent',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    deskId: { type: DataTypes.INTEGER, allowNull: false, references: { model: Desk, key: 'deskId' } },
    lastOpenedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    indexes: [
      { unique: true, fields: ['userId', 'deskId'] },
      { fields: ['userId', 'lastOpenedAt'] },
      { fields: ['deskId'] },
    ],
  }
);

// User favorites for any desk they can read (HomePage -> Избранные доски).
const DeskFavorite = sequelize.define(
  'desk_favorite',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    deskId: { type: DataTypes.INTEGER, allowNull: false, references: { model: Desk, key: 'deskId' } },
  },
  {
    indexes: [
      { unique: true, fields: ['userId', 'deskId'] },
      { fields: ['userId', 'createdAt'] },
      { fields: ['deskId'] },
    ],
  }
);

const Element = sequelize.define('element', {
  elementId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isIn: [['note', 'text', 'document', 'link', 'drawing', 'connector']] },
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

// Logical connector line between 2 elements.
// Stored as an Element with a small JSON payload describing anchors and optional bend/shape params.
const Connector = sequelize.define('connector', {
  elementId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    references: { model: Element, key: 'elementId' },
  },
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
        // Back-compat: DEADLINE is kept for older clients; UI maps it to "ДЗ".
        'DEADLINE',
        'HOMEWORK',
        'OTHER',
      ]],
    },
  },
  title: { type: DataTypes.STRING, allowNull: false },
  subject: { type: DataTypes.STRING, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  // Optional attachments/links for the event (e.g. lecture notes, Zoom link).
  // Stored as an array of objects: [{ title?: string, url: string }]
  materials: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
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
      validate: { isIn: [['CT', 'COLLOQUIUM', 'EXAM', 'DEADLINE', 'HOMEWORK', 'OTHER']] },
    },
    title: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    materials: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
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

// --- Material Block (учебное хранилище на доске) ---
const MaterialBlock = sequelize.define(
  'material_block',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    boardId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Desk, key: 'deskId' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    title: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Материалы' },
    x: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    y: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    width: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 280 },
    height: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 160 },
  },
  {
    indexes: [{ fields: ['boardId'] }],
  }
);

const MaterialCard = sequelize.define(
  'material_card',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    blockId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: MaterialBlock, key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    title: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
    content: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: User, key: 'id' } },
  },
  {
    indexes: [{ fields: ['blockId', 'createdAt'] }, { fields: ['blockId'] }],
  }
);

const MaterialFile = sequelize.define(
  'material_file',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cardId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: MaterialCard, key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    fileUrl: { type: DataTypes.TEXT, allowNull: false },
    fileType: { type: DataTypes.STRING, allowNull: true },
    size: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    indexes: [{ fields: ['cardId'] }],
  }
);

const MaterialLink = sequelize.define(
  'material_link',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cardId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: MaterialCard, key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    url: { type: DataTypes.TEXT, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: true },
  },
  {
    indexes: [{ fields: ['cardId'] }],
  }
);

const MaterialCardTag = sequelize.define(
  'material_card_tag',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cardId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: MaterialCard, key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    tag: { type: DataTypes.STRING, allowNull: false },
  },
  {
    indexes: [{ fields: ['cardId'] }, { unique: true, fields: ['cardId', 'tag'] }],
  }
);

// --- Relationships ---
User.hasMany(Project, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Project.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Desk, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Desk.belongsTo(User, { foreignKey: 'userId' });

Project.hasMany(Desk, { foreignKey: 'projectId', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
Desk.belongsTo(Project, { foreignKey: 'projectId' });

User.hasMany(DeskRecent, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
DeskRecent.belongsTo(User, { foreignKey: 'userId' });

Desk.hasMany(DeskRecent, { foreignKey: 'deskId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
DeskRecent.belongsTo(Desk, { foreignKey: 'deskId' });

User.hasMany(DeskFavorite, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
DeskFavorite.belongsTo(User, { foreignKey: 'userId' });

Desk.hasMany(DeskFavorite, { foreignKey: 'deskId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
DeskFavorite.belongsTo(Desk, { foreignKey: 'deskId' });

User.hasMany(RefreshToken, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });

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

Element.hasOne(Connector, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Connector.belongsTo(Element, { foreignKey: 'elementId' });

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

Desk.hasMany(MaterialBlock, { foreignKey: 'boardId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
MaterialBlock.belongsTo(Desk, { foreignKey: 'boardId' });

MaterialBlock.hasMany(MaterialCard, { foreignKey: 'blockId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
MaterialCard.belongsTo(MaterialBlock, { foreignKey: 'blockId' });

User.hasMany(MaterialCard, { foreignKey: 'createdBy', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
MaterialCard.belongsTo(User, { foreignKey: 'createdBy' });

MaterialCard.hasMany(MaterialFile, { foreignKey: 'cardId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
MaterialFile.belongsTo(MaterialCard, { foreignKey: 'cardId' });

MaterialCard.hasMany(MaterialLink, { foreignKey: 'cardId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
MaterialLink.belongsTo(MaterialCard, { foreignKey: 'cardId' });

MaterialCard.hasMany(MaterialCardTag, { foreignKey: 'cardId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
MaterialCardTag.belongsTo(MaterialCard, { foreignKey: 'cardId' });

module.exports = {
  User,
  RefreshToken,
  Notification,
  Project,
  Desk,
  DeskRecent,
  DeskFavorite,
  Group,
  GroupMember,
  Element,
  Note,
  NoteVersion,
  Text,
  Document,
  Link,
  Drawing,
  Connector,
  Comment,
  CalendarEvent,
  CalendarGroupPeriod,
  CalendarGroupPeriodInvite,
  CalendarMyEvent,
  CalendarEventInvite,
  CalendarNotificationLog,
  MaterialBlock,
  MaterialCard,
  MaterialFile,
  MaterialLink,
  MaterialCardTag,
};