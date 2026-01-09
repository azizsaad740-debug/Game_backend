/**
 * Sweet Bonanza Lobby Service
 * Manages the universal game session loop
 */

const User = require('../models/User.model');
const Transaction = require('../models/Transaction.model');
const BalanceHistory = require('../models/BalanceHistory.model');
const GameControl = require('../models/GameControl.model');
const mongoose = require('mongoose');

// Constants
const ROUND_TIMES = {
    BETTING: 10,  // Phase 1: 10 seconds
    SPINNING: 15, // Phase 2: 15 seconds
    RESULT: 10    // Phase 3: 10 seconds (increased from 8 to show win/loss screen)
};

class SweetBonanzaService {
    constructor() {
        this.session = {
            roundId: 'SB-' + Date.now(),
            phase: 'BETTING', // 'BETTING', 'SPINNING', 'RESULT'
            timeLeft: ROUND_TIMES.BETTING,
            roundCount: 0,
            bets: [], // { userId, betAmount, side: 'win' | 'loss' }
            adminDecision: null, // 'win' | 'loss'
            result: null, // { reels, winAmount, winningPositions }
            lastRoundId: null
        };
        this.activePlayers = new Set();
        this.isRunning = false;
        this.startLoop();
    }

    async startLoop() {
        if (this.isRunning) {
            console.log('[SB LOBBY] Loop already running, skipping duplicate start');
            return;
        }
        this.isRunning = true;
        console.log('>>> [SWEET BONANZA] SERVICE INITIALIZED AND LOOP STARTING <<<');
        console.log(`[SB LOBBY] Initial State - Phase: ${this.session.phase}, TimeLeft: ${this.session.timeLeft}s, Round: ${this.session.roundId}`);

        const tick = async () => {
            try {
                this.session.timeLeft--;

                // Detailed logging for debugging
                if (this.session.timeLeft % 5 === 0 || this.session.timeLeft <= 0) {
                    console.log(`[SB LOBBY] Phase: ${this.session.phase}, TimeLeft: ${this.session.timeLeft}s, Round: ${this.session.roundId}`);
                }

                if (this.session.timeLeft <= 0) {
                    await this.nextPhase();
                }

                // Clear active players every minute
                if (new Date().getSeconds() === 0) {
                    this.activePlayers.clear();
                }
            } catch (error) {
                console.error('CRITICAL: Sweet Bonanza loop tick failed:', error);
                // Recovery: Force back to BETTING
                this.session.phase = 'BETTING';
                this.session.timeLeft = 10;
            } finally {
                setTimeout(tick, 1000);
            }
        };

        // Start the loop immediately
        tick();
    }

    async nextPhase() {
        console.log(`[SB LOBBY] Transitioning from ${this.session.phase}...`);
        switch (this.session.phase) {
            case 'BETTING':
                this.session.phase = 'SPINNING';
                this.session.timeLeft = ROUND_TIMES.SPINNING;
                break;
            case 'SPINNING':
                await this.calculateResult();
                this.session.phase = 'RESULT';
                this.session.timeLeft = ROUND_TIMES.RESULT;
                break;
            case 'RESULT':
                this.startNewRound();
                break;
        }
        console.log(`[SB LOBBY] New Phase: ${this.session.phase}, TimeLeft: ${this.session.timeLeft}s`);
    }

    startNewRound() {
        this.session.roundCount++;
        // Maintain a 1-5 cycle for the algorithm
        this.session.roundCycle = ((this.session.roundCount - 1) % 5) + 1;

        this.session.roundId = 'SB-' + Date.now();
        this.session.phase = 'BETTING';
        this.session.timeLeft = ROUND_TIMES.BETTING;
        this.session.bets = [];
        this.session.adminDecision = null;
        this.session.result = null;
        console.log(`[SB LOBBY] --- NEW ROUND STARTED: ${this.session.roundId} (Cycle: ${this.session.roundCycle}/5) ---`);
    }

    async calculateResult() {
        const { bets, adminDecision, roundCycle } = this.session;
        let decision = adminDecision;

        const winBetsTotal = (bets || []).filter(b => b.side === 'win').reduce((sum, b) => sum + (Number(b.betAmount) || 0), 0);
        const lossBetsTotal = (bets || []).filter(b => b.side === 'loss').reduce((sum, b) => sum + (Number(b.betAmount) || 0), 0);

        // Identify the majority side (in terms of total betting amount)
        const majoritySide = winBetsTotal >= lossBetsTotal ? 'win' : 'loss';
        const minoritySide = majoritySide === 'win' ? 'loss' : 'win';

        if (!decision) {
            // Algorithm of 5 rounds:
            // 1st Round: Majority LOSS (House wins, Minority side wins)
            // 5th Round: Majority WIN (Players win, Majority side wins)
            // 2-4 Rounds: Default to Anti-Majority (House profitable)
            if (roundCycle === 1) {
                console.log('[SB LOBBY] Algorithm: Round 1 - Majority LOSS enforced');
                decision = minoritySide;
            } else if (roundCycle === 5) {
                console.log('[SB LOBBY] Algorithm: Round 5 - Majority WIN enforced');
                decision = majoritySide;
            } else {
                console.log('[SB LOBBY] Algorithm: Standard Round - Anti-Majority enforced');
                decision = minoritySide;
            }
        }

        console.log(`[SB LOBBY] Round Result: ${decision} (Admin Override: ${adminDecision ? 'YES' : 'NO'}, Round Cycle: ${roundCycle})`);

        const gameResult = this.generateSlotOutcome(decision);

        // Generate Top 10 Winners List (Actual + Fake)
        const winnersList = await this.generateWinnersList(decision, gameResult);
        gameResult.topWinners = winnersList;

        this.session.result = gameResult;
        await this.processPayouts(decision, gameResult);
    }

    async generateWinnersList(slotOutcome, gameResult) {
        const winners = [];
        const { bets } = this.session;

        // 1. Add actual winners first
        if (bets && bets.length > 0) {
            for (const bet of bets) {
                if (bet.side === slotOutcome) {
                    try {
                        const user = await User.findById(bet.userId);
                        if (user) {
                            // Mask ID/Username for privacy: SB-***123
                            const maskedId = `P-***${user._id.toString().slice(-4)}`;
                            winners.push({
                                id: maskedId,
                                amount: bet.betAmount * 2,
                                isReal: true
                            });
                        }
                    } catch (err) {
                        console.error('Error fetching user for winners list:', err);
                    }
                }
            }
        }

        // 2. Add fake winners to fill up to 10 (or more for "attraction")
        const targetCount = Math.max(10, winners.length + 3);
        const fakeNames = ['Swift', 'Sugar', 'Candy', 'Rich', 'Lucky', 'Gold', 'Fruit', 'Berry', 'Sweet', 'Mega'];
        const fakeSuffix = ['Player', 'King', 'Boss', 'Winner', 'Star', 'Pro', 'Ace', 'VIP', 'Master', 'God'];

        while (winners.length < targetCount) {
            const randomId = `P-***${Math.floor(1000 + Math.random() * 9000)}`;
            // Fake amount: 100 to 5000
            const randomAmount = Math.floor(Math.random() * 4900) + 100;
            winners.push({
                id: randomId,
                amount: randomAmount,
                isReal: false
            });
        }

        // Sort: Real winners first, then by amount descending
        return winners.sort((a, b) => {
            if (a.isReal !== b.isReal) return a.isReal ? -1 : 1;
            return b.amount - a.amount;
        }).slice(0, 10);
    }

    generateSlotOutcome(decision) {
        const SYMBOLS = ['oval', 'grapes', 'watermelon', 'apple', 'plum', 'banana', 'heart'];
        const reels = Array(6).fill(null).map(() =>
            Array(5).fill(null).map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
        );

        if (decision === 'win') {
            // Force at least one set of 12+ symbols to ensure a solid win visualization
            const winSym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            let count = 0;
            while (count < 12) {
                const c = Math.floor(Math.random() * 6);
                const r = Math.floor(Math.random() * 5);
                if (reels[c][r] !== winSym) {
                    reels[c][r] = winSym;
                    count++;
                }
            }
        } else {
            // Ensure NO symbol has more than 7 occurrences to guarantee a loss
            const SYMBOLS_SAFE = [...SYMBOLS];
            for (const sym of SYMBOLS_SAFE) {
                let count = 0;
                for (let c = 0; c < 6; c++) {
                    for (let r = 0; r < 5; r++) {
                        if (reels[c][r] === sym) {
                            count++;
                            if (count >= 8) {
                                // Replace with another symbol
                                let nextSym;
                                do {
                                    nextSym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                                } while (nextSym === sym);
                                reels[c][r] = nextSym;
                            }
                        }
                    }
                }
            }
        }

        return {
            reels,
            outcome: decision,
            winAmount: decision === 'win' ? 1 : 0
        };
    }

    async processPayouts(slotOutcome, gameResult) {
        try {
            for (const bet of (this.session.bets || [])) {
                if (bet.userId === 'anonymous') continue;

                const user = await User.findById(bet.userId);
                if (!user) continue;

                const userWon = bet.side === slotOutcome;
                const betAmount = Number(bet.betAmount) || 0;

                if (userWon) {
                    const payout = betAmount * 2;
                    await User.updateOne({ _id: bet.userId }, { $inc: { balance: payout } });

                    await Transaction.create({
                        user: bet.userId,
                        type: 'game_win',
                        amount: payout,
                        status: 'completed',
                        description: `Sweet Bonanza Lobby Win (${bet.side})`,
                        metadata: { roundId: this.session.roundId, betAmount: betAmount, side: bet.side }
                    });
                } else {
                    await Transaction.create({
                        user: bet.userId,
                        type: 'game_loss',
                        amount: betAmount,
                        status: 'completed',
                        description: `Sweet Bonanza Lobby Loss (${bet.side})`,
                        metadata: { roundId: this.session.roundId, betAmount: betAmount, side: bet.side }
                    });
                }
            }
            console.log(`[SB LOBBY] Payouts processed for ${this.session.bets.length} bets.`);
        } catch (error) {
            console.error('[SB LOBBY] Payout error:', error);
        }
    }

    getState(userId) {
        if (userId && userId !== 'anonymous') this.activePlayers.add(userId.toString());

        const winBetsTotal = (this.session.bets || []).filter(b => b.side === 'win').reduce((sum, b) => sum + (Number(b.betAmount) || 0), 0);
        const lossBetsTotal = (this.session.bets || []).filter(b => b.side === 'loss').reduce((sum, b) => sum + (Number(b.betAmount) || 0), 0);

        const uniqueBetters = new Set((this.session.bets || []).map(b => b.userId ? b.userId.toString() : 'guest'));
        const viewersCount = Math.max(0, this.activePlayers.size - uniqueBetters.size);

        return {
            phase: this.session.phase,
            timeLeft: Math.max(0, this.session.timeLeft),
            roundId: this.session.roundId,
            roundCycle: this.session.roundCycle || 1,
            adminDecision: this.session.adminDecision,
            result: this.session.result,
            betsCount: (this.session.bets || []).length,
            viewersCount: viewersCount,
            totalPlayers: Math.max(this.activePlayers.size, (this.session.bets || []).length),
            betsTotals: {
                win: winBetsTotal,
                loss: lossBetsTotal
            }
        };
    }

    addBet(userId, betAmount, side) {
        if (this.session.phase !== 'BETTING') return { success: false, message: 'Betting is closed' };
        if (this.session.timeLeft < 1) return { success: false, message: 'Betting time expired' };

        this.session.bets.push({ userId, betAmount: Number(betAmount), side });
        return { success: true };
    }

    setAdminDecision(decision) {
        if (this.session.phase !== 'SPINNING') {
            console.log(`[SB LOBBY] Admin decision ignored - not in SPINNING phase (Current: ${this.session.phase})`);
            return;
        }
        this.session.adminDecision = decision;
        console.log(`[SB LOBBY] Admin manual decision set: ${decision}`);
    }
}

module.exports = new SweetBonanzaService();
