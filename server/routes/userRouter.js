const Router = require('express');
const router = new Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { createRateLimit } = require('../middleware/rateLimit');
const { uploadAvatar } = require('../middleware/uploadMiddleware');

const authBurstLimit = createRateLimit({ windowMs: 5 * 60_000, max: 10, keyPrefix: 'auth' });
const refreshLimit = createRateLimit({ windowMs: 5 * 60_000, max: 60, keyPrefix: 'refresh' });

router.post('/registration', authBurstLimit, userController.registration);
router.post('/login', authBurstLimit, userController.login);
router.post('/google', authBurstLimit, userController.googleAuth);
router.post('/refresh', refreshLimit, userController.refresh);
router.post('/logout', userController.logout);
router.get('/auth', authMiddleware, userController.check);

// Profile
router.get('/profile', authMiddleware, userController.getProfile);
router.patch('/profile', authMiddleware, userController.updateProfile);
router.post(
  '/avatar',
  authMiddleware,
  (req, res, next) => {
    uploadAvatar.single('avatar')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      return next();
    });
  },
  userController.uploadAvatar
);

module.exports = router;
