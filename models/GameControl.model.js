const mongoose = require('mongoose');

const GameControlSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    username: {
        type: String,
        required: true
    },
    gameType: {
        type: String,
        default: 'sweet-bonanza'
    },
    betAmount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'timeout'],
        default: 'pending'
    },
    result: {
        type: String,
        enum: ['win', 'loss'],
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 3600 // Auto-delete after 1 hour
    }
}, { timestamps: true });

module.exports = mongoose.model('GameControl', GameControlSchema);
