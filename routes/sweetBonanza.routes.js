/**
 * Sweet Bonanza Game Routes
 */

const express = require('express');
const router = express.Router();
const sweetBonanzaController = require('../controllers/sweetBonanza.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Public endpoints (no auth required)
router.get('/debug-session', sweetBonanzaController.getDebugSession);
router.get('/session', sweetBonanzaController.getSession);
router.post('/bet', sweetBonanzaController.placeLobbyBet);

// All routes below require authentication
router.use(authMiddleware);

// Play game
router.post('/play', sweetBonanzaController.playGame);

// Lobby Session routes (admin only)
router.post('/admin-decision', sweetBonanzaController.submitAdminDecision);

// Get game history
router.get('/history', sweetBonanzaController.getGameHistory);

// Get statistics
router.get('/stats', sweetBonanzaController.getStats);

module.exports = router;

