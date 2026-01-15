const { Desk } = require('../models/models');

class WorkspacesController {
    async create(req, res) {
        try {
            const { name, description, type } = req.body || {};
            const userId = req.user?.id;
            
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
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
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            const desks = await Desk.findAll({ where: { userId } });
            return res.json(desks);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getOne(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            // Always scope reads by owner to avoid leaking existence of other users' desks.
            const desk = await Desk.findOne({ where: { deskId: id, userId } });
            if (!desk) return res.status(404).json({ error: 'Workspace not found' });
            
            return res.json(desk);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const { name, description, type } = req.body;
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            // Always scope updates by owner.
            const desk = await Desk.findOne({ where: { deskId: id, userId } });
            if (!desk) return res.status(404).json({ error: 'Workspace not found' });
            
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
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            // Always scope deletes by owner.
            const desk = await Desk.findOne({ where: { deskId: id, userId } });
            if (!desk) return res.status(404).json({ error: 'Workspace not found' });
            
            await desk.destroy();
            return res.json({ message: 'Workspace deleted successfully' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new WorkspacesController();

