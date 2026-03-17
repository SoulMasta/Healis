const express = require('express');
const router = express.Router();
const controller = require('../controllers/libraryController');

router.get('/subjects', controller.getSubjects);
router.post('/subjects', controller.createSubjects);
router.get('/subjects/:id/categories', controller.getSubjectCategories);
router.get('/boards', controller.getBoards);
router.get('/popular', controller.getPopular);

module.exports = router;

