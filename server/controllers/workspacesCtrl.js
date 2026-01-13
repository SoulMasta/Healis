const { Desk } = require('../models/models');

class WorkspacesController {
    async create(req, res) {
        try {
            const { name, description, userId, type } = req.body;
            
            if (!name || !userId) {
                return res.status(400).json({ error: 'Name and userId are required' });
            }
            
            const desk = await Desk.create({ name, description, userId, type });
            return res.status(201).json(desk);
        } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(409).json({ error: 'Workspace with this name already exists' });
            }
            return res.status(500).json({ error: error.message });
        }
    }

    async getAll(req, res) {
        try {
            const { userId } = req.query;
            
            const where = {};
            if (userId) {
                where.userId = userId;
            }
            
            const desks = await Desk.findAll({ where });
            return res.json(desks);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getOne(req, res) {
        try {
            const { id } = req.params;
            
            const desk = await Desk.findByPk(id);
            if (!desk) {
                return res.status(404).json({ error: 'Workspace not found' });
            }
            
            return res.json(desk);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const { name, description, type } = req.body;
            
            const desk = await Desk.findByPk(id);
            if (!desk) {
                return res.status(404).json({ error: 'Workspace not found' });
            }
            
            if (name !== undefined) desk.name = name;
            if (description !== undefined) desk.description = description;
            if (type !== undefined) desk.type = type;
            
            await desk.save();
            return res.json(desk);
        } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(409).json({ error: 'Workspace with this name already exists' });
            }
            return res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            
            const desk = await Desk.findByPk(id);
            if (!desk) {
                return res.status(404).json({ error: 'Workspace not found' });
            }
            
            await desk.destroy();
            return res.json({ message: 'Workspace deleted successfully' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new WorkspacesController();

