const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const storageService = require('../services/storageService');
const authMiddleware = require('../middleware/authMiddleware');
const { randomUUID } = require('crypto');

const router = express.Router();

/**
 * Generic file upload endpoint used by the frontend.
 * Returns { url, key, size, type, originalName }.
 * Field name: 'file'
 */
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const userId = req.user?.id;
    const file = req.file;
    const extMatch = (file.originalname || '').match(/(\.[^.]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    const key = `documents/${userId}/${randomUUID()}${ext}`;
    await storageService.uploadFile(file.buffer, key, file.mimetype);
    const url = await storageService.getFileUrl(key);
    return res.status(201).json({
      url,
      key,
      size: file.size,
      type: file.mimetype,
      originalName: file.originalname || null,
    });
  } catch (err) {
    console.error('storageRouter.upload error', err && err.message);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

router.post('/delete', authMiddleware, async (req, res) => {
  try {
    const key = req.body?.key;
    if (!key) return res.status(400).json({ error: 'key is required' });
    await storageService.deleteFile(key);
    return res.json({ ok: true });
  } catch (err) {
    console.error('storageRouter.delete error', err && err.message);
    return res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

module.exports = router;

