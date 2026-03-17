const { Subject, SubjectCategory, Desk, User } = require('../models/models');
const sequelize = require('../db');
const { Op } = require('sequelize');
async function getSubjects(req, res) {
  const rawFaculty = req.query.faculty;
  const course = Number(req.query.course);
  const faculty = typeof rawFaculty === 'string' ? rawFaculty.trim() : rawFaculty;
 
  if (!faculty || !course) {
    
    return res.status(400).json({ error: 'faculty and course are required' });
  }
  try {
    // Case-insensitive match on faculty to tolerate variations in client token.
    const subs = await Subject.findAll({
      where: sequelize.and(
        sequelize.where(sequelize.fn('LOWER', sequelize.col('faculty')), faculty.toLowerCase()),
        { course }
      ),
      order: [['name', 'ASC']],
    });
    
    return res.json(subs);
  } catch (e) {
    
    return res.status(500).json({ error: e.message || 'Failed to load subjects' });
  }
}

// Save provided subject list (create if not exists)
async function createSubjects(req, res) {
  const { faculty, course, subjects } = req.body || {};
  if (!faculty || !course || !Array.isArray(subjects)) {
    return res.status(400).json({ error: 'faculty, course and subjects[] are required' });
  }
  try {
    const out = [];
    for (const name of subjects) {
      const trimmed = String(name || '').trim();
      if (!trimmed) continue;
      const [rec] = await Subject.findOrCreate({
        where: { name: trimmed, faculty, course },
        defaults: { name: trimmed, faculty, course },
      });
      out.push(rec);
    }
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to save subjects' });
  }
}

async function getSubjectCategories(req, res) {
  const subjectId = Number(req.params.id);
  if (!subjectId) return res.status(400).json({ error: 'subject id required' });
  try {
    const cats = await SubjectCategory.findAll({ where: { subjectId }, order: [['name', 'ASC']] });
    return res.json(cats);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to load categories' });
  }
}

// Boards: basic implementation filtering desks by subject name match or subjectId
async function getBoards(req, res) {
  const { subject: subjectQ, category } = req.query;
  try {
    const where = {};
    if (subjectQ) {
      // If numeric, treat as subjectId; otherwise do name match
      if (!Number.isNaN(Number(subjectQ))) {
        const subj = await Subject.findByPk(Number(subjectQ));
        if (subj) {
          where.name = sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), 'LIKE', `%${subj.name.toLowerCase()}%`);
        }
      } else {
        where.name = { [Op.iLike]: `%${subjectQ}%` };
      }
    }
    // For now ignore category filter - future: join with category mapping
    const desks = await Desk.findAll({ where, limit: 200, order: [['createdAt', 'DESC']] });
    // Attach simple author info
    const usersById = {};
    const out = await Promise.all(
      desks.map(async (d) => {
        const author = d.userId ? await User.findByPk(d.userId) : null;
        return {
          id: d.deskId || d.id,
          title: d.name,
          author: author ? author.nickname || author.username || author.email : null,
          created_at: d.createdAt,
        };
      })
    );
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to load boards' });
  }
}

// Popular boards: sort by simple metric (views not present on Desk). We'll approximate using material_cards count.
async function getPopular(req, res) {
  try {
    // Very basic: return newest desks as placeholder
    const desks = await Desk.findAll({ limit: 20, order: [['createdAt', 'DESC']] });
    const out = desks.map((d) => ({ id: d.deskId || d.id, title: d.name, created_at: d.createdAt }));
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to load popular boards' });
  }
}

module.exports = {
  getSubjects,
  createSubjects,
  getSubjectCategories,
  getBoards,
  getPopular,
};

