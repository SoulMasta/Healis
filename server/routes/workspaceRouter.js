const express = require('express');
const { sendReactApp, navigate } = require('./pageHandlers');
const workspacesCtrl = require('../controllers/workspacesCtrl');
const elementsCtrl = require('../controllers/elementsCtrl');
const uploadsCtrl = require('../controllers/uploadsCtrl');
const linkPreviewCtrl = require('../controllers/linkPreviewCtrl');
const authMiddleware = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

const router = express.Router();

// Page routes: serves the SPA shell
router.get('/', sendReactApp);
router.get('/navigate', navigate('workspace'));

// API routes for workspace (desk) CRUD operations
router.post('/desk', authMiddleware, workspacesCtrl.create);
router.get('/desk', authMiddleware, workspacesCtrl.getAll);
router.get('/desk/:id', authMiddleware, workspacesCtrl.getOne);
router.put('/desk/:id', authMiddleware, workspacesCtrl.update);
router.delete('/desk/:id', authMiddleware, workspacesCtrl.delete);

// API routes for elements on a desk
router.get('/desk/:deskId/elements', authMiddleware, elementsCtrl.getAllByDesk);
router.post('/desk/:deskId/elements', authMiddleware, elementsCtrl.createOnDesk);
router.get('/elements/:elementId', authMiddleware, elementsCtrl.getOne);
router.put('/elements/:elementId', authMiddleware, elementsCtrl.update);
router.delete('/elements/:elementId', authMiddleware, elementsCtrl.delete);

// Upload a file for a desk (returns a URL that can be used in a `document` element)
// We wrap multer to return a clean 400 on validation issues (unsupported type, size limit, etc).
router.post('/desk/:deskId/upload', authMiddleware, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    return next();
  });
}, uploadsCtrl.uploadToDesk);

// Link preview (OpenGraph/Twitter/meta) for creating `link` elements.
router.post('/link/preview', authMiddleware, linkPreviewCtrl.preview);

module.exports = router;
