const express = require('express');
const { sendReactApp, navigate } = require('./pageHandlers');

const router = express.Router();

// "Page" route: serves the SPA shell
router.get('/', sendReactApp);

// Navigation handler (API)
router.get('/navigate', navigate('home'));

module.exports = router;


