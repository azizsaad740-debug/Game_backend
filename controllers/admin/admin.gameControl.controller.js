const GameControl = require('../../models/GameControl.model');
const { asyncHandler, AppError } = require('../../middleware/error.middleware');

/**
 * Get all pending game controls
 * GET /api/admin/game-controls/pending
 */
exports.getPendingSpins = asyncHandler(async (req, res) => {
    const pendingSpins = await GameControl.find({ status: 'pending' })
        .sort({ createdAt: -1 })
        .populate('user', 'username email balance');

    res.json({
        success: true,
        data: pendingSpins
    });
});

/**
 * Submit decision for a game control
 * POST /api/admin/game-controls/:id/decision
 */
exports.submitDecision = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { decision } = req.body; // 'win' or 'loss'

    if (!['win', 'loss'].includes(decision)) {
        throw new AppError('Invalid decision. Must be "win" or "loss".', 400);
    }

    const gameControl = await GameControl.findById(id);

    if (!gameControl) {
        throw new AppError('Game control request not found', 404);
    }

    if (gameControl.status !== 'pending') {
        throw new AppError('This request has already been processed or timed out', 400);
    }

    gameControl.result = decision;
    gameControl.status = 'completed';
    await gameControl.save();

    res.json({
        success: true,
        message: `Decision "${decision}" submitted successfully`,
        data: gameControl
    });
});
