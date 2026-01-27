const { Project } = require('../models/models');

function requireAuth(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Not authorized' });
    return null;
  }
  return userId;
}

class ProjectsController {
  async listMine(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const rows = await Project.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
      });
      return res.json(rows);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  async create(req, res) {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      const row = await Project.create({ userId, name });
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}

module.exports = new ProjectsController();


