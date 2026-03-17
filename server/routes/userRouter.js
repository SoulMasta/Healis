const Router = require('express');
const router = new Router();
const userController = require('../controllers/userController');
const userEventsController = require('../controllers/userEventsCtrl');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { createRateLimit } = require('../middleware/rateLimit');

const authBurstLimit = createRateLimit({ windowMs: 5 * 60_000, max: 10, keyPrefix: 'auth' });
const refreshLimit = createRateLimit({ windowMs: 5 * 60_000, max: 60, keyPrefix: 'refresh' });

router.post('/registration', authBurstLimit, userController.registration);
router.post('/login', authBurstLimit, userController.login);
router.post('/refresh', refreshLimit, userController.refresh);
router.post('/logout', userController.logout);
router.get('/auth', authMiddleware, userController.check);

// Profile
router.get('/profile', authMiddleware, userController.getProfile);
router.patch('/profile', authMiddleware, userController.updateProfile);
// Save avatar (accepts either { avatarUrl } legacy or multipart upload with field 'file')
router.post('/avatar', authMiddleware, upload.single('file'), userController.uploadAvatar);

// Pilot analytics: client-side events that backend can't observe (e.g. view_file on public URL)
router.post('/events', authMiddleware, userEventsController.create);

module.exports = router;
