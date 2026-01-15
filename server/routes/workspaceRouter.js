const express = require('express');
const { sendReactApp, navigate } = require('./pageHandlers');
const workspacesCtrl = require('../controllers/workspacesCtrl');
const elementsCtrl = require('../controllers/elementsCtrl');
const authMiddleware = require('../middleware/authMiddleware');

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

module.exports = router;
