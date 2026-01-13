const express = require('express');
const { sendReactApp, navigate } = require('./pageHandlers');
const workspacesCtrl = require('../controllers/workspacesCtrl');

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

module.exports = router;
