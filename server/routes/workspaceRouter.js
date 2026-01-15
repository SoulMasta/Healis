const express = require('express');
const { sendReactApp, navigate } = require('./pageHandlers');
const workspacesCtrl = require('../controllers/workspacesCtrl');
const elementsCtrl = require('../controllers/elementsCtrl');

const router = express.Router();

// Page routes: serves the SPA shell
router.get('/', sendReactApp);
router.get('/navigate', navigate('workspace'));

// API routes for workspace (desk) CRUD operations
router.post('/desk', workspacesCtrl.create);
router.get('/desk', workspacesCtrl.getAll);
router.get('/desk/:id', workspacesCtrl.getOne);
router.put('/desk/:id', workspacesCtrl.update);
router.delete('/desk/:id', workspacesCtrl.delete);

// API routes for elements on a desk
router.get('/desk/:deskId/elements', elementsCtrl.getAllByDesk);
router.post('/desk/:deskId/elements', elementsCtrl.createOnDesk);
router.get('/elements/:elementId', elementsCtrl.getOne);
router.put('/elements/:elementId', elementsCtrl.update);
router.delete('/elements/:elementId', elementsCtrl.delete);

module.exports = router;
