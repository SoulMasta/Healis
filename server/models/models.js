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

Element.hasOne(Text, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Text.belongsTo(Element, { foreignKey: 'elementId' });

Element.hasOne(Document, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Document.belongsTo(Element, { foreignKey: 'elementId' });

Element.hasOne(Link, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Link.belongsTo(Element, { foreignKey: 'elementId' });

Element.hasOne(Drawing, { foreignKey: 'elementId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Drawing.belongsTo(Element, { foreignKey: 'elementId' });

module.exports = {
  User,
  Desk,
  Group,
  GroupMember,
  Element,
  Note,
  Text,
  Document,
  Link,
  Drawing,
};