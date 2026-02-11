const express = require('express');
const { sendReactApp, navigate } = require('./pageHandlers');
const workspacesCtrl = require('../controllers/workspacesCtrl');
const elementsCtrl = require('../controllers/elementsCtrl');
const noteVersionsCtrl = require('../controllers/noteVersionsCtrl');
const uploadsCtrl = require('../controllers/uploadsCtrl');
const linkPreviewCtrl = require('../controllers/linkPreviewCtrl');
const commentsCtrl = require('../controllers/commentsCtrl');
const materialBlocksCtrl = require('../controllers/materialBlocksCtrl');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Page routes: serves the SPA shell
router.get('/', sendReactApp);
router.get('/navigate', navigate('workspace'));

// API routes for workspace (desk) CRUD operations
router.post('/desk', authMiddleware, workspacesCtrl.create);
router.get('/desk', authMiddleware, workspacesCtrl.getAll);
router.get('/desk/recent', authMiddleware, workspacesCtrl.getRecent);
router.get('/desk/favorites', authMiddleware, workspacesCtrl.listFavorites);
router.post('/desk/:id/favorite', authMiddleware, workspacesCtrl.toggleFavorite);
router.post('/desk/:id/duplicate', authMiddleware, workspacesCtrl.duplicate);
router.get('/desk/:id', authMiddleware, workspacesCtrl.getOne);
router.put('/desk/:id', authMiddleware, workspacesCtrl.update);
router.delete('/desk/:id', authMiddleware, workspacesCtrl.delete);

// API routes for elements on a desk
router.get('/desk/:deskId/elements', authMiddleware, elementsCtrl.getAllByDesk);
router.post('/desk/:deskId/elements', authMiddleware, elementsCtrl.createOnDesk);
router.get('/elements/:elementId', authMiddleware, elementsCtrl.getOne);
router.put('/elements/:elementId', authMiddleware, elementsCtrl.update);
router.delete('/elements/:elementId', authMiddleware, elementsCtrl.delete);

// Note version history (for collaboration / restore)
router.get('/elements/:elementId/versions', authMiddleware, noteVersionsCtrl.list);
router.get('/elements/:elementId/versions/:version', authMiddleware, noteVersionsCtrl.get);
router.post('/elements/:elementId/versions/:version/restore', authMiddleware, noteVersionsCtrl.restore);

// Comments on elements (group desks only)
router.get('/elements/:elementId/comments', authMiddleware, commentsCtrl.listByElement);
router.post('/elements/:elementId/comments', authMiddleware, commentsCtrl.create);

// Save a file URL for a desk (file is uploaded to Supabase by frontend)
router.post('/desk/:deskId/upload', authMiddleware, uploadsCtrl.uploadToDesk);

// Link preview (OpenGraph/Twitter/meta) for creating `link` elements.
router.post('/link/preview', authMiddleware, linkPreviewCtrl.preview);

// Material blocks (учебное хранилище на доске)
router.get('/desk/:deskId/material-blocks', authMiddleware, materialBlocksCtrl.listByDesk);
router.post('/desk/:deskId/material-blocks', authMiddleware, materialBlocksCtrl.create);
router.get('/material-blocks/:blockId', authMiddleware, materialBlocksCtrl.getOne);
router.put('/material-blocks/:blockId', authMiddleware, materialBlocksCtrl.update);
router.delete('/material-blocks/:blockId', authMiddleware, materialBlocksCtrl.delete);
router.get('/material-blocks/:blockId/cards', authMiddleware, materialBlocksCtrl.getCards);
router.post('/material-blocks/:blockId/cards', authMiddleware, materialBlocksCtrl.createCard);
router.get('/material-cards/:cardId', authMiddleware, materialBlocksCtrl.getCard);
router.put('/material-cards/:cardId', authMiddleware, materialBlocksCtrl.updateCard);
router.delete('/material-cards/:cardId', authMiddleware, materialBlocksCtrl.deleteCard);
// Save a file URL for a material card (file is uploaded to Supabase by frontend)
router.post('/material-cards/:cardId/upload', authMiddleware, materialBlocksCtrl.uploadCardFile);
router.post('/material-cards/:cardId/links', authMiddleware, materialBlocksCtrl.addCardLink);
router.delete('/material-links/:linkId', authMiddleware, materialBlocksCtrl.deleteCardLink);
router.delete('/material-files/:fileId', authMiddleware, materialBlocksCtrl.deleteCardFile);
router.put('/material-cards/:cardId/tags', authMiddleware, materialBlocksCtrl.setCardTags);

module.exports = router;
