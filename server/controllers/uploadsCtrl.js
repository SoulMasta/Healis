const { Desk } = require('../models/models');
const { canManageDesk } = require('../utils/deskAccess');

/**
 * UploadsController - handles saving file URLs to the database
 * Files are uploaded directly to Supabase Storage from the frontend
 * Backend only receives and stores the resulting public URLs
 */
class UploadsController {
  /**
   * Save a file URL for a desk (file already uploaded to Supabase by frontend)
   */
  async uploadToDesk(req, res) {
    try {
      const { deskId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const desk = await Desk.findByPk(deskId);
      if (!desk) return res.status(404).json({ error: 'Workspace not found' });
      const canManage = await canManageDesk(desk, userId);
      if (!canManage) return res.status(403).json({ error: 'Forbidden' });

      const { url, originalName, mimeType, size } = req.body || {};
      if (!url) return res.status(400).json({ error: 'No URL provided' });

      // Return the file info (URL is already a Supabase public URL)
      return res.status(201).json({
        url,
        title: originalName || 'File',
        originalName: originalName || 'File',
        mimeType: mimeType || null,
        size: size || null,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new UploadsController();


