const { Desk } = require('../models/models');
const { canManageDesk } = require('../utils/deskAccess');
const { logUserEvent } = require('../services/userEventLogger');
const storageService = require('../services/storageService');
const { randomUUID } = require('crypto');

/**
 * UploadsController - handles saving file URLs to the database
 * Files are uploaded directly to Object Storage (Yandex) from the frontend or via backend proxy
 * Backend only receives and stores the resulting public or signed URLs
 */
class UploadsController {
  /**
   * Save a file URL for a desk (file already uploaded to object storage by frontend)
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

      // Accept either a direct URL (legacy) or a multipart file upload (field name 'file')
      const { url, originalName, mimeType, size } = req.body || {};
      if (req.file) {
        // Upload buffer to Yandex
        const file = req.file;
        const extMatch = (file.originalname || '').match(/(\.[^.]+)$/);
        const ext = extMatch ? extMatch[1] : '';
        const key = `documents/${userId}/${randomUUID()}${ext}`;
        await storageService.uploadFile(file.buffer, key, file.mimetype);
        const publicUrl = await storageService.getFileUrl(key);

        logUserEvent({
          userId,
          eventType: 'upload_file',
          entityType: 'desk',
          entityId: deskId,
          metadata: {
            url: publicUrl,
            originalName: file.originalname || null,
            mimeType: file.mimetype || null,
            size: file.size || null,
            key,
          },
        });

        return res.status(201).json({
          url: publicUrl,
          title: file.originalname || 'File',
          originalName: file.originalname || 'File',
          mimeType: file.mimetype || null,
          size: file.size || null,
          key,
        });
      }

      if (!url) return res.status(400).json({ error: 'No URL provided' });

      // Pilot analytics: file uploaded to a desk (document/link element, etc.)
      logUserEvent({
        userId,
        eventType: 'upload_file',
        entityType: 'desk',
        entityId: deskId,
        metadata: {
          url,
          originalName: originalName || null,
          mimeType: mimeType || null,
          size: size || null,
        },
      });

      // Return the file info (URL is assumed to be already hosted)
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


