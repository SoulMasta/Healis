const express = require('express');
const { sendReactApp, navigate } = require('./pageHandlers');

const router = express.Router();

router.get('/', sendReactApp);
router.get('/navigate', navigate('workspace'));

module.exports = router;


