const path = require('path');
const { Desk } = require('../models/models');
const { canManageDesk } = require('../utils/deskAccess');

function fixMojibakeName(name) {
  const s = String(name || '');
  const looksMojibake = /[ÐÑ]/.test(s) && !/[А-Яа-яЁё]/.test(s);
  if (!looksMojibake) return s.normalize('NFC');
  try {
    return Buffer.from(s, 'latin1').toString('utf8').normalize('NFC');
  } catch {
    return s.normalize('NFC');
  }
}

class UploadsController {
  async uploadToDesk(req, res) {
    try {
      const { deskId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const desk = await Desk.findByPk(deskId);
      if (!desk) return res.status(404).json({ error: 'Workspace not found' });
      const canManage = await canManageDesk(desk, userId);
      if (!canManage) return res.status(403).json({ error: 'Forbidden' });

      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file provided' });

      // Build a stable public URL (served by /uploads static)
      const filename = path.basename(file.filename);
      const url = `/uploads/${userId}/${deskId}/${encodeURIComponent(filename)}`;
      const originalName = fixMojibakeName(file.originalname);

      return res.status(201).json({
        url,
        title: originalName,
        originalName,
        mimeType: file.mimetype,
        size: file.size,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new UploadsController();


