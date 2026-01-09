
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const {
  register,
  login,
  refreshToken,
  getMe,
  forgotPassword,
  resetPassword,
  logout,
  quickAdminLogin,
  quickUserLogin
} = require('../controllers/auth.controller');

// ------------------------
// PUBLIC ROUTES
// ------------------------
router.post('/register', register);
router.post('/login', login);
router.post('/quick-admin-login', quickAdminLogin);
router.post('/quick-user-login', quickUserLogin);

router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/refresh-token', refreshToken);

// ------------------------
// PRIVATE ROUTES
// ------------------------
router.get('/me', authMiddleware, getMe);

module.exports = router;
