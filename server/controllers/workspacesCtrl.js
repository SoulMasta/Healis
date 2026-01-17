const { Desk } = require('../models/models');
const { canReadDesk, canManageDesk } = require('../utils/deskAccess');

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
            return res.status(500).json({ error: error.message });
        }
    }

    async getAll(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            // Personal desks only. Group desks are fetched via /api/groups/:id/desks.
            const desks = await Desk.findAll({ where: { userId, groupId: null } });
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

            const desk = await Desk.findByPk(id);
            if (!desk) return res.status(404).json({ error: 'Workspace not found' });
            const ok = await canReadDesk(desk, userId);
            if (!ok) return res.status(404).json({ error: 'Workspace not found' });
            
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

            const desk = await Desk.findByPk(id);
            if (!desk) return res.status(404).json({ error: 'Workspace not found' });
            const ok = await canManageDesk(desk, userId);
            if (!ok) return res.status(403).json({ error: 'Forbidden' });
            
            if (name !== undefined) desk.name = name;
            if (description !== undefined) desk.description = description;
            if (type !== undefined) desk.type = type;
            
            await desk.save();
            return res.json(desk);
        } catch (error) {
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

            const desk = await Desk.findByPk(id);
            if (!desk) return res.status(404).json({ error: 'Workspace not found' });
            const ok = await canManageDesk(desk, userId);
            if (!ok) return res.status(403).json({ error: 'Forbidden' });
            
            await desk.destroy();
            return res.json({ message: 'Workspace deleted successfully' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new WorkspacesController();

