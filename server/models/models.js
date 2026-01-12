const sequelize = require('../db');
const {DataTypes} = require('sequelize');

const User = sequelize.define('user', {
    id: {type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true},
    email: {type: DataTypes.STRING, unique: true},
    password: {type: DataTypes.STRING},
    role: {type: DataTypes.STRING, defaultValue: "USER"},
})

const Desk = sequelize.define('desk', {
    id: {type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true},
    name: {type: DataTypes.STRING, unique: true},
    description: {type: DataTypes.STRING},
    userId: {type: DataTypes.INTEGER, references: {model: User, key: 'id'}},
    type: {type: DataTypes.STRING},
})

const Group = sequelize.define('group', {
    id: {type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true},
    name: {type: DataTypes.STRING, unique: true},
    description: {type: DataTypes.STRING},
})

User.hasMany(Desk, {foreignKey: 'userId'});
Desk.belongsTo(User, {foreignKey: 'userId'});
User.hasMany(Group, {foreignKey: 'userId'});
Group.belongsTo(User, {foreignKey: 'userId'});
Group.hasMany(Desk, {foreignKey: 'groupId'});
Desk.belongsTo(Group, {foreignKey: 'groupId'});

module.exports = {
    User,
    Desk,
    Group,
}