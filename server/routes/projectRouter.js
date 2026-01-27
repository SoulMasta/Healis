const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const projectsCtrl = require('../controllers/projectsCtrl');

const router = express.Router();

router.get('/', authMiddleware, projectsCtrl.listMine);
router.post('/', authMiddleware, projectsCtrl.create);

module.exports = router;


