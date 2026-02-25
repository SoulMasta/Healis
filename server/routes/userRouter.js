const Router = require('express');
const router = new Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
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
// Save avatar URL (file is uploaded to Supabase by frontend)
router.post('/avatar', authMiddleware, userController.uploadAvatar);

module.exports = router;
