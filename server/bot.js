/**
 * Monopoly AI Bot - Advanced Strategic AI
 * Features:
 * - Tracks all player properties and board state
 * - Proactively proposes beneficial trades
 * - Blocks opponent monopolies
 * - Smart property valuation based on game context
 * - Strategic building decisions
 * - Adaptive play style based on game phase
 * - Three difficulty levels: easy, medium, hard
 */

const io = require('socket.io-client');

const BOT_NAMES = {
    easy: ['NoviceBot', 'BeginnerAI', 'CasualPlayer', 'FriendlyBot', 'LearnBot', 'NewbieAI'],
    medium: ['TacticalBot', 'StrategistAI', 'CleverPlayer', 'SmartBot', 'ChallengerAI', 'AdeptBot'],
    hard: ['RoboTycoon', 'MonopolyMaster', 'PropertyKing', 'LandBaron', 'RealEstateBot', 'WealthBot']
};

// Difficulty presets - affects all strategic decisions
const DIFFICULTY_CONFIGS = {
    easy: {
        // Property buying - less strategic, buys almost everything
        buyPropertyThreshold: 0.10,      // Buy properties more readily
        minCashReserve: 50,              // Keep less cash reserve
        blockOpponentBonus: 0,           // Doesn't recognize blocking opportunities
        monopolyCompletionBonus: 0.2,    // Small bonus for completing monopoly

        // Building - less optimal
        buildWhenCashAbove: 200,
        maxBuildingSpend: 0.8,           // Spends more, leaves less reserve

        // Auctions - overbids or underbids randomly
        auctionAggressiveness: 0.5,      // Less aggressive in auctions
        auctionRandomness: 0.3,          // 30% random variance

        // Trading - accepts bad trades, doesn't negotiate well
        tradeAcceptThreshold: 0.8,       // Accepts trades at 0.8x value
        tradeCashMultiplier: 1.2,        // Only needs 1.2x for cash trades
        blockingPropertyMultiplier: 1.5, // Sells blocking properties too cheap
        monopolyGiveawayMultiplier: 2.0, // Gives away monopoly-completing too cheap
        proposesTradesFrequency: 0.3,    // Rarely proposes trades

        // Jail - suboptimal decisions
        jailPayThreshold: 100,           // Pays fine even when poor
        jailStayLateGame: false,         // Doesn't use late-game jail strategy

        // Strategic awareness
        recognizesBlocking: false,       // Doesn't see blocking opportunities
        recognizesMonopolyValue: false,  // Doesn't prioritize monopoly completion
        colorGroupAwareness: 0.3,        // Low color group value awareness
    },
    medium: {
        // Property buying - some strategy
        buyPropertyThreshold: 0.20,
        minCashReserve: 75,
        blockOpponentBonus: 0.25,        // Some blocking awareness
        monopolyCompletionBonus: 0.4,

        // Building
        buildWhenCashAbove: 250,
        maxBuildingSpend: 0.7,

        // Auctions
        auctionAggressiveness: 0.70,
        auctionRandomness: 0.15,

        // Trading - moderate negotiation
        tradeAcceptThreshold: 1.0,
        tradeCashMultiplier: 1.3,
        blockingPropertyMultiplier: 2.0,
        monopolyGiveawayMultiplier: 2.5,
        proposesTradesFrequency: 0.6,

        // Jail
        jailPayThreshold: 150,
        jailStayLateGame: true,

        // Strategic awareness
        recognizesBlocking: true,
        recognizesMonopolyValue: true,
        colorGroupAwareness: 0.6,
    },
    hard: {
        // Property buying - optimal strategy
        buyPropertyThreshold: 0.25,
        minCashReserve: 100,
        blockOpponentBonus: 0.5,
        monopolyCompletionBonus: 0.7,

        // Building
        buildWhenCashAbove: 300,
        maxBuildingSpend: 0.6,

        // Auctions
        auctionAggressiveness: 0.85,
        auctionRandomness: 0,

        // Trading - expert negotiation
        tradeAcceptThreshold: 1.0,
        tradeCashMultiplier: 1.5,
        blockingPropertyMultiplier: 2.5,
        monopolyGiveawayMultiplier: 3.0,
        proposesTradesFrequency: 1.0,

        // Jail
        jailPayThreshold: 200,
        jailStayLateGame: true,

        // Strategic awareness
        recognizesBlocking: true,
        recognizesMonopolyValue: true,
        colorGroupAwareness: 1.0,
    }
};

class MonopolyBot {
    /**
     * Create a new Monopoly Bot
     * @param {string} serverUrl - WebSocket server URL
     * @param {string} gameId - Game ID to join
     * @param {string} botName - Optional custom bot name
     * @param {string} difficulty - 'easy', 'medium', or 'hard' (default: 'hard')
     */
    constructor(serverUrl, gameId, botName = null, difficulty = 'hard') {
        this.serverUrl = serverUrl;
        this.gameId = gameId;
        this.difficulty = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'hard';
        
        // Get appropriate name for difficulty
        const namePool = BOT_NAMES[this.difficulty] || BOT_NAMES.hard;
        this.botName = botName || namePool[Math.floor(Math.random() * namePool.length)];
        
        this.socket = null;
        this.gameState = null;
        this.myPlayer = null;
        this.isMyTurn = false;
        this.actionInProgress = false;
        this.turnCheckTimer = null;
        this.lastActionTime = Date.now();
        this.tradeAttempts = new Map();
        this.lastTradeTime = 0;
        this.declinedTrades = new Map();
        this.receivedTradeHistory = new Map();
        this.auctionActionTimer = null;
        this.auctionActionToken = 0;

        // Load difficulty-specific configuration
        const difficultyConfig = DIFFICULTY_CONFIGS[this.difficulty];
        
        // Strategy settings - merge difficulty config with base config
        this.config = {
            // Property buying
            buyPropertyThreshold: difficultyConfig.buyPropertyThreshold,
            minCashReserve: difficultyConfig.minCashReserve,
            blockOpponentBonus: difficultyConfig.blockOpponentBonus,
            monopolyCompletionBonus: difficultyConfig.monopolyCompletionBonus,

            // Building
            buildWhenCashAbove: difficultyConfig.buildWhenCashAbove,
            maxBuildingSpend: difficultyConfig.maxBuildingSpend,

            // Auctions
            auctionAggressiveness: difficultyConfig.auctionAggressiveness,
            auctionRandomness: difficultyConfig.auctionRandomness,

            // Trading
            tradeCheckInterval: 15000,
            minTradeValue: 50,
            tradeAcceptThreshold: difficultyConfig.tradeAcceptThreshold,
            tradeCashMultiplier: difficultyConfig.tradeCashMultiplier,
            blockingPropertyMultiplier: difficultyConfig.blockingPropertyMultiplier,
            monopolyGiveawayMultiplier: difficultyConfig.monopolyGiveawayMultiplier,
            proposesTradesFrequency: difficultyConfig.proposesTradesFrequency,

            // Jail
            jailPayThreshold: difficultyConfig.jailPayThreshold,
            jailStayLateGame: difficultyConfig.jailStayLateGame,

            // Strategic awareness
            recognizesBlocking: difficultyConfig.recognizesBlocking,
            recognizesMonopolyValue: difficultyConfig.recognizesMonopolyValue,
            colorGroupAwareness: difficultyConfig.colorGroupAwareness,

            // Timing
            actionDelay: 1500,
            turnCheckInterval: 3000,

            // Humanized delay ranges
            delays: {
                rollDice: { min: 1000, max: 3000 },
                buyProperty: { min: 2000, max: 5000 },
                declineProperty: { min: 1500, max: 3500 },
                auctionBid: { min: 1000, max: 3000 },
                auctionPass: { min: 800, max: 2000 },
                tradeDecision: { min: 2000, max: 5000 },
                proposeTrade: { min: 1500, max: 4000 },
                buildHouse: { min: 300, max: 800 },
                jailDecision: { min: 1500, max: 4000 },
                endTurn: { min: 800, max: 2000 },
                postLanding: { min: 2500, max: 5000 },
                sellAsset: { min: 500, max: 1500 },
            },
        };

        // Color group values (higher = more valuable for monopoly)
        // Adjusted by colorGroupAwareness for easier difficulties
        const baseRanking = {
            'orange': 10,
            'red': 9,
            'yellow': 8,
            'light-blue': 7,
            'pink': 6,
            'green': 5,
            'dark-blue': 4,
            'brown': 3,
        };
        
        // For easy bots, flatten the ranking differences
        this.colorGroupRanking = {};
        for (const [color, value] of Object.entries(baseRanking)) {
            const awareness = this.config.colorGroupAwareness;
            // Blend toward average (6.5) based on awareness
            this.colorGroupRanking[color] = 6.5 + (value - 6.5) * awareness;
        }
        
        console.log(`[BOT ${this.botName}] Created with difficulty: ${this.difficulty.toUpperCase()}`);
    }

    /**
     * Get a random delay within the configured range for an action type
     * @param {string} actionType - The type of action (e.g., 'rollDice', 'buyProperty')
     * @returns {number} Random delay in milliseconds
     */
    getRandomDelay(actionType) {
        const delayConfig = this.config.delays[actionType];
        if (!delayConfig) {
            // Fallback to a reasonable default if action type not found
            return 1000 + Math.random() * 2000;
        }
        return delayConfig.min + Math.random() * (delayConfig.max - delayConfig.min);
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.socket = io(this.serverUrl, { transports: ['websocket'] });

            this.socket.on('connect', () => {
                console.log(`[BOT ${this.botName}] Connected to server`);
                this.setupEventHandlers();
                resolve();
            });

            this.socket.on('connect_error', (err) => {
                console.log(`[BOT ${this.botName}] Connection error:`, err.message);
                reject(err);
            });

            this.socket.on('disconnect', () => {
                console.log(`[BOT ${this.botName}] Disconnected`);
                this.stopTurnChecker();
            });
        });
    }

    setupEventHandlers() {
        this.socket.on('gameJoined', ({ game }) => {
            console.log(`[BOT ${this.botName}] Joined game`);
            this.updateGameState(game);
        });

        this.socket.on('gameStarted', ({ game }) => {
            console.log(`[BOT ${this.botName}] Game started!`);
            this.updateGameState(game);
            this.startTurnChecker();
            this.checkAndTakeTurn();
        });

        this.socket.on('diceRolled', ({ result, game }) => {
            const wasInJail = this.myPlayer?.inJail;
            this.updateGameState(game);

            if (this.isMyTurn && wasInJail) {
                if (result.isDoubles) {
                    console.log(`[BOT ${this.botName}] Escaped jail with doubles!`);
                } else if (game.diceRolled && !game.canRollAgain) {
                    console.log(`[BOT ${this.botName}] Failed jail roll, ending turn`);
                    this.scheduleEndTurn(1500);
                }
            }
        });

        this.socket.on('landingResult', ({ result, game }) => {
            this.updateGameState(game);
            if (this.isMyTurn) {
                const delay = this.getRandomDelay('postLanding');
                console.log(`[BOT ${this.botName}] Thinking about next move... (${Math.round(delay / 1000)}s)`);
                setTimeout(() => this.handlePostLanding(), delay);
            }
        });

        this.socket.on('propertyBought', ({ game }) => {
            this.updateGameState(game);
            if (this.isMyTurn) {
                this.scheduleEndTurn(1000);
            }
        });

        this.socket.on('propertyDeclined', ({ game }) => {
            this.updateGameState(game);
            if (this.isMyTurn && !game.auction) {
                this.scheduleEndTurn(1000);
            }
        });

        this.socket.on('auctionStarted', ({ auction, game }) => {
            this.updateGameState(game);
            if (auction) {
                const delay = this.getRandomDelay('auctionBid');
                this.scheduleAuctionTimer(() => this.handleAuction(this.gameState.auction), delay, auction.property.index);
            }
        });

        this.socket.on('auctionUpdate', ({ auction, game }) => {
            this.updateGameState(game);
            if (auction) {
                const delay = this.getRandomDelay('auctionBid');
                this.scheduleAuctionTimer(() => this.handleAuction(this.gameState.auction), delay, auction.property.index);
            } else {
                this.clearAuctionTimer();
                if (this.isMyTurn) {
                    this.scheduleEndTurn(this.getRandomDelay('endTurn'));
                }
            }
        });

        this.socket.on('turnEnded', ({ game }) => {
            this.updateGameState(game);
            this.actionInProgress = false;
            this.checkAndTakeTurn();
        });

        this.socket.on('jailFinePaid', ({ game }) => {
            this.updateGameState(game);
            const delay = this.getRandomDelay('rollDice');
            setTimeout(() => this.rollDice(), delay);
        });

        this.socket.on('jailCardUsed', ({ game }) => {
            this.updateGameState(game);
            const delay = this.getRandomDelay('rollDice');
            setTimeout(() => this.rollDice(), delay);
        });

        this.socket.on('tradeProposed', ({ trade, game }) => {
            this.updateGameState(game);
            this.handleTradeProposal(trade);
        });

        this.socket.on('tradeCompleted', ({ game }) => {
            this.updateGameState(game);
            console.log(`[BOT ${this.botName}] Trade completed!`);
        });

        this.socket.on('tradeDeclined', ({ tradeId, game, declinedByPlayer }) => {
            this.updateGameState(game);

            // Track that our trade was declined - find the trade we proposed
            // This helps us avoid spamming the same offer
            if (declinedByPlayer) {
                console.log(`[BOT ${this.botName}] Trade was declined by player`);
            }
        });

        this.socket.on('houseBuilt', ({ game }) => {
            this.updateGameState(game);
        });

        this.socket.on('houseSold', ({ game }) => {
            this.updateGameState(game);
            if (this.gameState.pendingAction?.type === 'mustRaiseFunds' ||
                this.gameState.pendingAction?.type === 'mustPayOrBankrupt') {
                const delay = this.getRandomDelay('sellAsset');
                setTimeout(() => this.handleBankruptcyState(this.gameState.pendingAction), delay);
            }
        });

        this.socket.on('propertyMortgaged', ({ game }) => {
            this.updateGameState(game);
            if (this.gameState.pendingAction?.type === 'mustRaiseFunds' ||
                this.gameState.pendingAction?.type === 'mustPayOrBankrupt') {
                const delay = this.getRandomDelay('sellAsset');
                setTimeout(() => this.handleBankruptcyState(this.gameState.pendingAction), delay);
            } else if (this.isMyTurn && !this.gameState.pendingAction) {
                this.scheduleEndTurn(this.getRandomDelay('endTurn'));
            }
        });

        this.socket.on('playerBankrupt', ({ game }) => {
            this.updateGameState(game);
        });

        this.socket.on('playerDisconnected', ({ game }) => {
            this.updateGameState(game);
        });

        this.socket.on('playerReconnected', ({ game }) => {
            this.updateGameState(game);
            // Resume play if we were paused
            if (this.isMyTurn) {
                this.checkAndTakeTurn();
            }
        });

        this.socket.on('gameOver', ({ game }) => {
            console.log(`[BOT ${this.botName}] Game over!`);
            this.stopTurnChecker();
        });

        this.socket.on('error', ({ message }) => {
            console.log(`[BOT ${this.botName}] Server error: ${message}`);
            this.actionInProgress = false;
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GAME STATE ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Analyze the current game phase (early, mid, late)
     */
    getGamePhase() {
        if (!this.gameState) return 'early';

        const totalProperties = this.gameState.board.filter(s =>
            s.type === 'property' || s.type === 'railroad' || s.type === 'utility'
        ).length;

        const ownedProperties = this.gameState.board.filter(s =>
            (s.type === 'property' || s.type === 'railroad' || s.type === 'utility') && s.owner !== null
        ).length;

        const ownershipRatio = ownedProperties / totalProperties;

        if (ownershipRatio < 0.3) return 'early';
        if (ownershipRatio < 0.7) return 'mid';
        return 'late';
    }

    /**
     * Get all color groups and their ownership status
     */
    analyzeColorGroups() {
        const analysis = {};
        const colors = ['brown', 'light-blue', 'pink', 'orange', 'red', 'yellow', 'green', 'dark-blue'];

        for (const color of colors) {
            const group = this.gameState.board.filter(s => s.color === color);
            if (group.length === 0) continue;

            const owners = {};
            let unowned = 0;

            group.forEach(prop => {
                if (prop.owner === null) {
                    unowned++;
                } else {
                    owners[prop.owner] = (owners[prop.owner] || 0) + 1;
                }
            });

            analysis[color] = {
                total: group.length,
                unowned,
                owners,
                properties: group,
                monopolyOwner: Object.entries(owners).find(([_, count]) => count === group.length)?.[0] || null,
                isMine: owners[this.myPlayer?.id] === group.length,
                myCount: owners[this.myPlayer?.id] || 0,
                neededForMonopoly: group.length - (owners[this.myPlayer?.id] || 0),
            };
        }

        return analysis;
    }

    /**
     * Get the board space for a property reference (handles both index and object)
     * @param {number|Object} propData - Property index or object with index property
     * @returns {Object|null} The board space or null
     */
    getPropertyFromData(propData) {
        if (propData === null || propData === undefined) return null;
        if (typeof propData === 'number') {
            return this.gameState.board[propData] || null;
        }
        if (typeof propData === 'object' && propData.index !== undefined) {
            return this.gameState.board[propData.index] || propData;
        }
        return propData;
    }

    /**
     * Analyze what each player has and needs
     */
    analyzePlayerStrategies() {
        const players = {};

        for (const player of this.gameState.players) {
            if (player.bankrupt || player.id === this.myPlayer?.id) continue;

            const colorGroups = {};
            const ownedByColor = {};

            // Count properties by color
            for (const propData of player.properties) {
                const prop = this.getPropertyFromData(propData);
                if (!prop) continue;

                if (prop.color) {
                    ownedByColor[prop.color] = (ownedByColor[prop.color] || 0) + 1;
                }
            }

            // Analyze each color group for this player
            for (const [color, count] of Object.entries(ownedByColor)) {
                const groupTotal = this.gameState.board.filter(s => s.color === color).length;
                colorGroups[color] = {
                    owned: count,
                    total: groupTotal,
                    hasMonopoly: count === groupTotal,
                    needsOne: count === groupTotal - 1,
                };
            }

            players[player.id] = {
                name: player.name,
                money: player.money,
                propertyCount: player.properties.length,
                colorGroups,
                wealthEstimate: this.estimatePlayerWealth(player),
            };
        }

        return players;
    }

    /**
     * Estimate total player wealth (money + property values)
     */
    estimatePlayerWealth(player) {
        let wealth = player.money;

        for (const propData of player.properties) {
            const prop = this.getPropertyFromData(propData);
            if (!prop) continue;

            wealth += prop.mortgaged ? 0 : (prop.mortgage || prop.price / 2);
            if (prop.houses) {
                wealth += prop.houses * (prop.houseCost || 0) / 2;
            }
        }

        return wealth;
    }

    /**
     * Check if a property would complete an opponent's monopoly
     */
    wouldCompleteOpponentMonopoly(property) {
        if (!property.color) return false;

        const colorGroup = this.gameState.board.filter(s => s.color === property.color);

        for (const player of this.gameState.players) {
            if (player.id === this.myPlayer?.id || player.bankrupt) continue;

            const ownedInGroup = colorGroup.filter(s => s.owner === player.id).length;
            if (ownedInGroup === colorGroup.length - 1) {
                // This player owns all but one - check if this property is the missing one
                const missingProp = colorGroup.find(s => s.owner !== player.id);
                if (missingProp && (missingProp.owner === null || missingProp.index === property.index)) {
                    return player;
                }
            }
        }

        return false;
    }

    /**
     * Find properties I own that opponents desperately want
     */
    findBlockingProperties() {
        const blocking = [];

        for (const propData of this.myPlayer.properties) {
            const prop = this.getPropertyFromData(propData);
            if (!prop || !prop.color) continue;

            const colorGroup = this.gameState.board.filter(s => s.color === prop.color);

            for (const player of this.gameState.players) {
                if (player.id === this.myPlayer.id || player.bankrupt) continue;

                const theirCount = colorGroup.filter(s => s.owner === player.id).length;
                const myCount = colorGroup.filter(s => s.owner === this.myPlayer.id).length;

                // I'm blocking their monopoly
                if (theirCount === colorGroup.length - myCount && myCount > 0) {
                    blocking.push({
                        property: prop,
                        blockedPlayer: player,
                        theirCount,
                        colorValue: this.colorGroupRanking[prop.color] || 5,
                    });
                }
            }
        }

        return blocking.sort((a, b) => b.colorValue - a.colorValue);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SMART TRADING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Generate a hash for a trade to track similar offers
     */
    generateTradeHash(trade) {
        const offerProps = (trade.offer?.properties || []).sort().join(',');
        const requestProps = (trade.request?.properties || []).sort().join(',');
        return `${offerProps}|${requestProps}`;
    }

    /**
     * Evaluate incoming trade proposal with strategic awareness
     */
    handleTradeProposal(trade) {
        if (trade.to !== this.myPlayer?.id) return;

        const fromPlayer = this.gameState.players.find(p => p.id === trade.from);
        console.log(`[BOT ${this.botName}] Received trade from ${fromPlayer?.name}`);

        // Check if we've declined similar trades recently from this player
        const tradeHash = this.generateTradeHash(trade);
        const historyKey = `${trade.from}-${tradeHash}`;
        const tradeHistory = this.receivedTradeHistory.get(historyKey);

        if (tradeHistory) {
            const timeSinceLastDecline = Date.now() - tradeHistory.timestamp;
            const cooldownTime = Math.min(tradeHistory.count * 60000, 300000); // 1-5 min cooldown based on decline count

            if (timeSinceLastDecline < cooldownTime && tradeHistory.count >= 2) {
                console.log(`[BOT ${this.botName}] Auto-declining - already declined similar trade ${tradeHistory.count} times`);
                const delay = this.getRandomDelay('tradeDecision');
                setTimeout(() => {
                    this.socket.emit('declineTrade', { gameId: this.gameId, tradeId: trade.id });
                }, delay);
                return;
            }
        }

        const evaluation = this.evaluateTradeAdvanced(trade);

        const tradeDelay = this.getRandomDelay('tradeDecision');
        console.log(`[BOT ${this.botName}] Considering trade offer... (${Math.round(tradeDelay / 1000)}s)`);

        setTimeout(() => {
            if (evaluation.shouldAccept) {
                console.log(`[BOT ${this.botName}] Accepting trade (value ratio: ${evaluation.ratio.toFixed(2)}, reason: ${evaluation.reason})`);
                this.socket.emit('acceptTrade', { gameId: this.gameId, tradeId: trade.id });
                // Clear decline history on accept
                this.receivedTradeHistory.delete(historyKey);
            } else {
                console.log(`[BOT ${this.botName}] Declining trade (value ratio: ${evaluation.ratio.toFixed(2)}, reason: ${evaluation.reason})`);
                this.socket.emit('declineTrade', { gameId: this.gameId, tradeId: trade.id });

                // Track declined trade
                const current = this.receivedTradeHistory.get(historyKey) || { count: 0 };
                this.receivedTradeHistory.set(historyKey, {
                    count: current.count + 1,
                    timestamp: Date.now(),
                    lastOffer: trade.offer?.money || 0
                });
            }
        }, tradeDelay);
    }

    /**
     * Advanced trade evaluation considering strategic value
     * Bot acts like a smart player - won't accept bad deals, but will accept great deals
     */
    evaluateTradeAdvanced(trade) {
        let receivingValue = trade.offer?.money || 0;
        let givingValue = trade.request?.money || 0;
        let strategicBonus = 0;
        let isBlockingProperty = false;
        let wouldGiveMonopoly = false;

        // Calculate total property values we're giving up
        let totalRequestedPropertyValue = 0;
        const requestedProps = trade.request?.properties || [];

        // Value properties we'd receive
        for (const propIndex of (trade.offer?.properties || [])) {
            const property = this.gameState.board[propIndex];
            const baseValue = this.calculatePropertyValueAdvanced(property, 'receiving');
            receivingValue += baseValue;

            // Bonus if this completes our monopoly
            if (this.wouldCompleteMyMonopoly(property)) {
                strategicBonus += property.price * 0.5;
                console.log(`[BOT ${this.botName}] Trade would complete my ${property.color} monopoly!`);
            }
        }

        // Value properties we'd give up
        for (const propIndex of requestedProps) {
            const property = this.gameState.board[propIndex];
            const baseValue = this.calculatePropertyValueAdvanced(property, 'giving');
            givingValue += baseValue;
            totalRequestedPropertyValue += property?.price || 0;

            // Check if this gives opponent a monopoly
            const blocked = this.wouldGiveOpponentMonopoly(property);
            if (blocked) {
                wouldGiveMonopoly = true;
                console.log(`[BOT ${this.botName}] Trade would give ${blocked.name} a monopoly!`);
            }

            // Check if we're blocking someone's monopoly
            const blocking = this.findBlockingProperties().find(b =>
                b.property.index === propIndex
            );
            if (blocking) {
                isBlockingProperty = true;
                console.log(`[BOT ${this.botName}] This property blocks ${blocking.blockedPlayer.name}'s monopoly!`);
            }
        }

        // Jail cards valued at £50 each
        const jailCardValue = (trade.offer?.jailCards || 0) * 50;
        receivingValue += jailCardValue;
        givingValue += (trade.request?.jailCards || 0) * 50;

        const adjustedReceiving = receivingValue + strategicBonus;

        // Calculate cash ratio for cash-heavy offers (include jail card value as cash equivalent)
        const cashOffer = (trade.offer?.money || 0) + jailCardValue;
        const cashRatio = totalRequestedPropertyValue > 0 ? cashOffer / totalRequestedPropertyValue : 0;
        const cashOnlyOffer = (trade.offer?.properties || []).length === 0 && cashOffer > 0;

        // FAST PATH: Accept extremely generous cash offers regardless of strategy
        // If someone offers 4x+ the value, just take it
        if (cashOnlyOffer && cashRatio >= 4.0) {
            console.log(`[BOT ${this.botName}] Accepting massive overpay: ${cashRatio.toFixed(1)}x value`);
            return {
                shouldAccept: true,
                ratio: cashRatio,
                reason: 'massive overpay accepted',
                receivingValue: adjustedReceiving,
                givingValue
            };
        }

        // Calculate required cash multiplier based on strategic importance and difficulty
        const baseCashMultiplier = this.config.tradeCashMultiplier;
        const blockingMultiplier = this.config.blockingPropertyMultiplier;
        const monopolyMultiplier = this.config.monopolyGiveawayMultiplier;
        
        let requiredCashMultiplier = baseCashMultiplier;
        if (wouldGiveMonopoly && isBlockingProperty) {
            requiredCashMultiplier = monopolyMultiplier + (blockingMultiplier - baseCashMultiplier);
        } else if (wouldGiveMonopoly) {
            requiredCashMultiplier = monopolyMultiplier;
        } else if (isBlockingProperty) {
            requiredCashMultiplier = blockingMultiplier;
        }

        // For cash-only trades, use the cash ratio comparison
        if (cashOnlyOffer && requestedProps.length > 0) {
            const shouldAccept = cashRatio >= requiredCashMultiplier;

            if (!shouldAccept) {
                console.log(`[BOT ${this.botName}] Cash offer too low: £${cashOffer} for £${totalRequestedPropertyValue} (${cashRatio.toFixed(2)}x, need ${requiredCashMultiplier}x)`);
            }

            let reason = 'standard cash evaluation';
            if (wouldGiveMonopoly) reason = 'gives opponent monopoly - high premium required';
            else if (isBlockingProperty) reason = 'blocking property - premium required';

            return {
                shouldAccept,
                ratio: cashRatio,
                reason,
                receivingValue: adjustedReceiving,
                givingValue
            };
        }

        // For property swaps or mixed trades, use value-based ratio
        // Apply strategic penalties to giving value for ratio calculation (scaled by difficulty)
        let adjustedGiving = givingValue;
        
        // Penalties only apply if bot recognizes blocking/monopoly value
        if (this.config.recognizesMonopolyValue && wouldGiveMonopoly) {
            adjustedGiving += totalRequestedPropertyValue * 1.5 * this.config.colorGroupAwareness;
        } else if (this.config.recognizesBlocking && isBlockingProperty) {
            adjustedGiving += totalRequestedPropertyValue * 1.0 * this.config.colorGroupAwareness;
        }

        const ratio = adjustedReceiving / Math.max(adjustedGiving, 1);

        // Required ratio varies by difficulty (easy bots accept worse trades)
        let requiredRatio = this.config.tradeAcceptThreshold;
        if (this.config.recognizesMonopolyValue && wouldGiveMonopoly) {
            requiredRatio *= 1.2; // Need 20% better deal
        } else if (this.config.recognizesBlocking && isBlockingProperty) {
            requiredRatio *= 1.1; // Need 10% better deal
        }

        const shouldAccept = ratio >= requiredRatio;

        let reason = 'standard evaluation';
        if (strategicBonus > 0) reason = 'completes monopoly';
        if (wouldGiveMonopoly) reason = 'gives opponent monopoly - high premium required';
        else if (isBlockingProperty) reason = 'blocking property - premium required';

        return {
            shouldAccept,
            ratio,
            reason,
            receivingValue: adjustedReceiving,
            givingValue: adjustedGiving,
        };
    }

    /**
     * Calculate property value with context
     */
    calculatePropertyValueAdvanced(property, context = 'neutral') {
        if (!property) return 0;

        let value = property.price || 0;

        // Add building value
        if (property.houses > 0) {
            value += property.houses * (property.houseCost || 0);
        }

        // Color group value multiplier
        const colorRank = this.colorGroupRanking[property.color] || 5;
        value *= (1 + colorRank * 0.02);

        // Monopoly potential
        if (context === 'receiving' && this.wouldCompleteMyMonopoly(property)) {
            value *= 1.8; // Much more valuable if it completes our monopoly
        }

        if (context === 'giving') {
            // Check if we're blocking someone
            const blocking = this.findBlockingProperties().find(b =>
                b.property.index === property.index
            );
            if (blocking) {
                value *= 1.5; // Worth more to us as a blocker
            }
        }

        // Railroad synergy
        if (property.type === 'railroad') {
            const myRailroads = this.gameState.board.filter(
                s => s.type === 'railroad' && s.owner === this.myPlayer.id
            ).length;
            value *= (1 + myRailroads * 0.15);
        }

        // Mortgaged discount
        if (property.mortgaged) {
            value = (property.mortgage || 0) * 1.1; // Unmortgage cost
        }

        return Math.floor(value);
    }

    wouldCompleteMyMonopoly(property) {
        if (!property.color) return false;
        const colorGroup = this.gameState.board.filter(s => s.color === property.color);
        const myCount = colorGroup.filter(s => s.owner === this.myPlayer.id).length;
        return myCount === colorGroup.length - 1 && property.owner !== this.myPlayer.id;
    }

    wouldGiveOpponentMonopoly(property) {
        if (!property.color) return false;
        const colorGroup = this.gameState.board.filter(s => s.color === property.color);

        for (const player of this.gameState.players) {
            if (player.id === this.myPlayer.id || player.bankrupt) continue;
            const theirCount = colorGroup.filter(s => s.owner === player.id).length;
            // If they'd have all but the one we're giving them
            if (theirCount === colorGroup.length - 1) {
                return player;
            }
        }
        return false;
    }

    /**
     * Proactively look for beneficial trades to propose
     */
    considerProposingTrade() {
        if (!this.isMyTurn || !this.gameState) return;
        if (Date.now() - this.lastTradeTime < this.config.tradeCheckInterval) return;
        
        // Check if bot should propose trades based on difficulty
        if (Math.random() > this.config.proposesTradesFrequency) {
            return; // Skip proposing trades this turn
        }

        const colorAnalysis = this.analyzeColorGroups();
        const playerAnalysis = this.analyzePlayerStrategies();

        // Find trades that could complete our monopoly
        for (const [color, analysis] of Object.entries(colorAnalysis)) {
            if (analysis.neededForMonopoly !== 1) continue; // Only look for one-property-away
            if (analysis.myCount === 0) continue;

            // Find who has the property we need
            const neededProps = analysis.properties.filter(p => p.owner !== this.myPlayer.id && p.owner !== null);

            for (const neededProp of neededProps) {
                const owner = this.gameState.players.find(p => p.id === neededProp.owner);
                if (!owner || owner.bankrupt) continue;

                // Check if we've tried this trade recently
                const tradeKey = `${owner.id}-${neededProp.index}`;
                const lastAttempt = this.tradeAttempts.get(tradeKey);

                if (lastAttempt) {
                    const timeSinceLastAttempt = Date.now() - lastAttempt.timestamp;
                    // Increase cooldown based on how many times we've been declined
                    // After 3 declines, wait at least 5 minutes before trying again
                    const cooldownTime = Math.min(lastAttempt.declineCount * 120000, 300000);
                    if (timeSinceLastAttempt < cooldownTime) continue;

                    // After 5 declines, stop trying this trade altogether
                    if (lastAttempt.declineCount >= 5) {
                        console.log(`[BOT ${this.botName}] Giving up on trading for ${neededProp.name} - declined too many times`);
                        continue;
                    }
                }

                // Find something to offer them
                const attemptCount = lastAttempt?.declineCount || 0;
                const offer = this.findTradeOffer(owner, neededProp, attemptCount);
                if (offer) {
                    console.log(`[BOT ${this.botName}] Proposing trade to ${owner.name} for ${neededProp.name}`);

                    // Track this trade attempt
                    const existingAttempt = this.tradeAttempts.get(tradeKey) || { declineCount: 0 };
                    this.tradeAttempts.set(tradeKey, {
                        timestamp: Date.now(),
                        declineCount: existingAttempt.declineCount + 1
                    });
                    this.lastTradeTime = Date.now();

                    // Add delay before proposing trade
                    const proposeDelay = this.getRandomDelay('proposeTrade');
                    console.log(`[BOT ${this.botName}] Preparing trade offer... (${Math.round(proposeDelay / 1000)}s)`);
                    setTimeout(() => {
                        this.socket.emit('proposeTrade', {
                            gameId: this.gameId,
                            targetPlayerId: owner.id,
                            offer: offer.offer,
                            request: { properties: [neededProp.index] }
                        });
                    }, proposeDelay);
                    return;
                }
            }
        }
    }

    /**
     * Find a fair trade offer for a property we want
     */
    /**
     * Find a fair trade offer for a property we want
     * @param {Object} targetPlayer - The player to trade with
     * @param {Object} wantedProperty - The property we want
     * @param {number} attemptCount - How many times we've tried and failed (0-based)
     */
    findTradeOffer(targetPlayer, wantedProperty, attemptCount = 0) {
        let wantedValue = this.calculatePropertyValueAdvanced(wantedProperty, 'receiving');

        // Negotiation Strategy:
        // Attempt 0: 0.9x - 1.0x (Testing waters / lowball)
        // Attempt 1: 1.1x - 1.2x (Serious offer)
        // Attempt 2: 1.25x - 1.35x (Premium)
        // Attempt 3+: 1.4x - 1.6x+ (Desperate / "I need this")
        let negotiationMultiplier = 0.9 + (attemptCount * 0.2);

        // Cap reasonable limits
        negotiationMultiplier = Math.min(negotiationMultiplier, 2.0);

        // Always offer at least a little premium for monopoly completion
        if (this.wouldCompleteMyMonopoly(wantedProperty)) {
            negotiationMultiplier = Math.max(negotiationMultiplier, 1.2 + (attemptCount * 0.15));
        }

        const effectiveWantedValue = Math.floor(wantedValue * negotiationMultiplier);

        // Try money offer first if we're rich
        // We require less reserves if it's a lowball offer, more if we are desperate
        const reserveMultiplier = attemptCount > 1 ? 1.0 : 1.5;

        if (this.myPlayer.money > effectiveWantedValue * reserveMultiplier + this.config.minCashReserve) {
            const moneyOffer = effectiveWantedValue;

            if (moneyOffer <= this.myPlayer.money - this.config.minCashReserve) {
                console.log(`[BOT ${this.botName}] Negotiation (attempt ${attemptCount}): Offering £${moneyOffer} for ${wantedProperty.name} (Value: £${wantedValue} x ${negotiationMultiplier.toFixed(2)})`);
                return {
                    offer: { money: moneyOffer },
                    expectedAcceptance: 0.5 + (attemptCount * 0.1),
                };
            }
        }

        // Try property swap
        // Find properties we own that might interest them
        const theirAnalysis = this.analyzePlayerStrategies()[targetPlayer.id];
        if (!theirAnalysis) return null;

        // Find properties that would help them toward a monopoly
        for (const propData of this.myPlayer.properties) {
            const prop = this.getPropertyFromData(propData);
            if (!prop || !prop.color) continue;

            // Don't trade away monopoly pieces
            const myGroupAnalysis = this.analyzeColorGroups()[prop.color];
            if (myGroupAnalysis?.isMine) continue;
            if (myGroupAnalysis?.myCount >= myGroupAnalysis?.total - 1) continue;

            // Check if they want this color
            const theirGroup = theirAnalysis.colorGroups[prop.color];
            if (theirGroup && theirGroup.needsOne) {
                // They're one away from monopoly in this color!
                const propValue = this.calculatePropertyValueAdvanced(prop, 'giving');

                // Calculate difference based on negotiation multiplier
                const diff = effectiveWantedValue - propValue;
                let moneyComponent = 0;

                if (diff > 0 && diff <= this.myPlayer.money - this.config.minCashReserve) {
                    moneyComponent = Math.floor(diff);
                }

                const totalOfferValue = propValue + moneyComponent;

                // If we are desperate (high attempt count), we accept a "worse" deal for us
                // i.e., we offering more value than perceived market value
                if (totalOfferValue >= effectiveWantedValue * 0.95) {
                    console.log(`[BOT ${this.botName}] Negotiation (attempt ${attemptCount}): Swap offer for ${wantedProperty.name} (My: ${prop.name} + £${moneyComponent})`);
                    return {
                        offer: {
                            properties: [prop.index || this.gameState.board.indexOf(prop)],
                            money: moneyComponent > 0 ? moneyComponent : undefined,
                        },
                        expectedAcceptance: 0.4 + (attemptCount * 0.1),
                    };
                }
            }
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SMART PROPERTY BUYING
    // ═══════════════════════════════════════════════════════════════════════

    evaluateProperty(property) {
        const money = this.myPlayer.money;
        const price = property.price;
        const gamePhase = this.getGamePhase();

        if (price > money) return false;

        // Adjust cash reserve based on game phase and difficulty
        const baseReserve = this.config.minCashReserve;
        const reserveNeeded = gamePhase === 'early' ? baseReserve * 0.5 :
            gamePhase === 'mid' ? baseReserve : baseReserve * 1.5;

        if (money - price < reserveNeeded) {
            // Exception: always buy if it completes our monopoly
            if (this.wouldCompleteMyMonopoly(property)) {
                console.log(`[BOT ${this.botName}] Buying ${property.name} despite low funds - completes monopoly!`);
                return true;
            }
            return false;
        }

        let score = 0;

        // Base affordability
        score += (1 - price / money) * 0.3;

        // Game phase adjustments
        if (gamePhase === 'early') {
            score += 0.2; // Buy more aggressively early
            if (price <= 200) score += 0.15;
        } else if (gamePhase === 'late') {
            score -= 0.1; // Be more selective late game
        }

        // Monopoly completion - priority based on difficulty
        if (this.config.recognizesMonopolyValue && this.wouldCompleteMyMonopoly(property)) {
            score += this.config.monopolyCompletionBonus;
            console.log(`[BOT ${this.botName}] ${property.name} would complete monopoly!`);
        } else {
            // Progress toward monopoly (reduced for easy bots)
            const progress = this.getColorGroupProgress(property);
            score += progress * 0.3 * this.config.colorGroupAwareness;
        }

        // Block opponent monopoly - importance based on difficulty
        if (this.config.recognizesBlocking) {
            const blocked = this.wouldCompleteOpponentMonopoly(property);
            if (blocked) {
                score += this.config.blockOpponentBonus;
                console.log(`[BOT ${this.botName}] ${property.name} blocks ${blocked.name}'s monopoly!`);
            }
        }

        // Color group value (already adjusted by colorGroupAwareness in constructor)
        const colorRank = this.colorGroupRanking[property.color];
        if (colorRank) {
            score += colorRank * 0.02;
        }

        // Railroads are very valuable
        if (property.type === 'railroad') {
            const ownedRailroads = this.getRailroadCount();
            score += 0.25 + ownedRailroads * 0.15;
        }

        // Utilities are okay
        if (property.type === 'utility') {
            const ownedUtilities = this.gameState.board.filter(
                s => s.type === 'utility' && s.owner === this.myPlayer.id
            ).length;
            score += 0.15 + ownedUtilities * 0.1;
        }

        // Wealth consideration
        if (money > price * 4) {
            score += 0.1;
        }

        console.log(`[BOT ${this.botName}] ${property.name} score: ${score.toFixed(2)} (phase: ${gamePhase}, difficulty: ${this.difficulty})`);

        return score >= this.config.buyPropertyThreshold;
    }

    getColorGroupProgress(property) {
        if (!property.color) return 0;
        const colorGroup = this.gameState.board.filter(s => s.color === property.color);
        const ownedInGroup = colorGroup.filter(s => s.owner === this.myPlayer.id).length;
        return ownedInGroup / colorGroup.length;
    }

    getRailroadCount() {
        return this.gameState.board.filter(
            s => s.type === 'railroad' && s.owner === this.myPlayer.id
        ).length;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SMART BUILDING
    // ═══════════════════════════════════════════════════════════════════════

    tryBuildHouses() {
        let spentSoFar = 0;
        let housesBuilt = 0;
        const maxHousesPerTurn = 10; // Limit to prevent excessive building

        // Collect all the houses we want to build
        const buildQueue = [];

        // Keep finding houses to build while we can afford it
        while (housesBuilt < maxHousesPerTurn) {
            const availableCash = this.myPlayer.money - this.config.minCashReserve - spentSoFar;
            const maxSpend = this.myPlayer.money * this.config.maxBuildingSpend - spentSoFar;
            const buildBudget = Math.min(availableCash, maxSpend);

            if (buildBudget < 50) break;

            const monopolies = this.findOwnedMonopolies();
            if (monopolies.length === 0) break;

            // Sort monopolies by value (orange/red first)
            monopolies.sort((a, b) => {
                const aRank = this.colorGroupRanking[a[0]?.color] || 0;
                const bRank = this.colorGroupRanking[b[0]?.color] || 0;
                return bRank - aRank;
            });

            let foundPropertyToBuild = false;

            // Build on best monopoly first, maintaining even building
            for (const colorGroup of monopolies) {
                // Check if any property is mortgaged
                if (colorGroup.some(p => p.mortgaged)) continue;

                // Find property with fewest houses (to maintain even building)
                const sortedByHouses = [...colorGroup].sort((a, b) => (a.houses || 0) - (b.houses || 0));
                const property = sortedByHouses[0];

                if ((property.houses || 0) >= 5) continue;
                if (!property.houseCost) continue;
                if (property.houseCost > buildBudget) continue;

                const propIndex = this.gameState.board.indexOf(property);

                // Add to build queue
                buildQueue.push({
                    propIndex,
                    propertyName: property.name,
                    currentHouses: property.houses || 0,
                    cost: property.houseCost
                });

                // Track what we've spent (locally for budget calculation)
                spentSoFar += property.houseCost;
                housesBuilt++;
                foundPropertyToBuild = true;

                // Update local property state to check even building correctly next iteration
                property.houses = (property.houses || 0) + 1;

                break; // Go back to loop start to re-sort by houses for even building
            }

            // If we couldn't find any property to build on, stop
            if (!foundPropertyToBuild) break;
        }

        // Now emit all build requests with staggered delays
        if (buildQueue.length > 0) {
            console.log(`[BOT ${this.botName}] Planning to build ${buildQueue.length} houses, total cost: £${spentSoFar}`);

            buildQueue.forEach((build, index) => {
                const buildDelay = this.getRandomDelay('buildHouse');
                setTimeout(() => {
                    console.log(`[BOT ${this.botName}] Building on ${build.propertyName} (${build.currentHouses} -> ${build.currentHouses + 1})`);
                    this.socket.emit('buildHouse', { gameId: this.gameId, propertyIndex: build.propIndex });
                }, index * buildDelay);
            });
        }
    }


    findOwnedMonopolies() {
        const monopolies = [];
        const colors = new Set(
            this.gameState.board.filter(s => s.color).map(s => s.color)
        );

        for (const color of colors) {
            const colorGroup = this.gameState.board.filter(s => s.color === color);
            if (colorGroup.length > 0 && colorGroup.every(s => s.owner === this.myPlayer.id)) {
                monopolies.push(colorGroup);
            }
        }

        return monopolies;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AUCTION HANDLING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Calculate the maximum bid we are willing to place
     * @param {Object} property - The property up for auction
     * @returns {number} The maximum bid amount
     */
    calculateAuctionLimit(property) {
        if (!property) return 0;

        let maxBid = property.price * this.config.auctionAggressiveness;
        
        // Add randomness for easier difficulties (makes bidding less optimal)
        if (this.config.auctionRandomness > 0) {
            const variance = (Math.random() - 0.5) * 2 * this.config.auctionRandomness;
            maxBid *= (1 + variance);
        }

        // Much higher for monopoly completion (only if bot recognizes monopoly value)
        if (this.config.recognizesMonopolyValue && this.wouldCompleteMyMonopoly(property)) {
            maxBid = property.price * (1.3 + this.config.colorGroupAwareness * 0.5);
        }

        // Higher to block opponent monopoly (only if bot recognizes blocking)
        if (this.config.recognizesBlocking) {
            const blocked = this.wouldCompleteOpponentMonopoly(property);
            if (blocked) {
                maxBid = Math.max(maxBid, property.price * (1.0 + this.config.blockOpponentBonus * 0.6));
            }
        }

        // Railroad synergy
        if (property.type === 'railroad' && this.getRailroadCount() >= 2) {
            maxBid = Math.max(maxBid, property.price * 1.2);
        }

        const canAfford = this.myPlayer.money - this.config.minCashReserve;
        return Math.floor(Math.min(maxBid, canAfford));
    }

    handleAuction(auction) {
        // Verify auction is still active in latest state
        if (!this.gameState.auction || (auction && this.gameState.auction.property.index !== auction.property.index)) {
            return;
        }

        if (!auction || !this.myPlayer) return;
        if (auction.passedPlayers?.includes(this.myPlayer.id)) return;
        
        // Don't bid if we're already the highest bidder - wait for others to act
        if (auction.highestBidder === this.myPlayer.id) {
            return;
        }

        const minDelayMs = auction.minBidDelayMs || 0;
        const lastBidAt = auction.lastBidAt || 0;
        const sinceLastBid = Date.now() - lastBidAt;
        if (lastBidAt && sinceLastBid < minDelayMs) {
            const waitMs = minDelayMs - sinceLastBid;
            this.scheduleAuctionTimer(
                () => this.handleAuction(this.gameState.auction),
                waitMs,
                auction.property.index
            );
            return;
        }

        const property = auction.property;
        const currentBid = auction.currentBid || 0;
        const minBid = Math.max(auction.minimumBid || 10, currentBid + 1);

        // Calculate max bid using isolated logic (easier to test)
        const maxBid = this.calculateAuctionLimit(property);

        // Log reasoning for debugging/human-feel
        if (this.wouldCompleteMyMonopoly(property)) {
            console.log(`[BOT ${this.botName}] Bidding aggressively - completes monopoly`);
        } else if (this.wouldCompleteOpponentMonopoly(property)) {
            console.log(`[BOT ${this.botName}] Bidding to block opponent`);
        }

        if (minBid <= maxBid) {
            // Strategic bid increment
            let bidAmount = minBid;

            // Small random increment to seem more human
            const increment = Math.floor(Math.random() * 15) + 5;
            bidAmount = Math.min(minBid + increment, maxBid);

            const bidDelay = this.getRandomDelay('auctionBid');
            console.log(`[BOT ${this.botName}] Bidding £${bidAmount} on ${property.name} (max: £${maxBid}) in ${Math.round(bidDelay / 1000)}s...`);

            this.scheduleAuctionTimer(
                () => this.socket.emit('auctionBid', { gameId: this.gameId, amount: bidAmount }),
                bidDelay,
                property.index
            );
        } else {
            const passDelay = this.getRandomDelay('auctionPass');
            console.log(`[BOT ${this.botName}] Passing on ${property.name} (min: £${minBid}, max: £${maxBid})`);
            this.scheduleAuctionTimer(
                () => this.socket.emit('auctionPass', { gameId: this.gameId }),
                passDelay,
                property.index
            );
        }
    }

    clearAuctionTimer() {
        if (this.auctionActionTimer) {
            clearTimeout(this.auctionActionTimer);
            this.auctionActionTimer = null;
        }
    }

    scheduleAuctionTimer(action, delayMs, propertyIndex) {
        this.clearAuctionTimer();
        const token = ++this.auctionActionToken;
        this.auctionActionTimer = setTimeout(() => {
            if (token !== this.auctionActionToken) return;
            if (!this.gameState?.auction || this.gameState.auction.property.index !== propertyIndex) return;
            if (this.gameState.auction.passedPlayers?.includes(this.myPlayer?.id)) return;
            action();
        }, delayMs);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TURN MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    startTurnChecker() {
        this.stopTurnChecker();
        this.turnCheckTimer = setInterval(() => {
            if (this.isMyTurn && !this.actionInProgress) {
                const timeSinceAction = Date.now() - this.lastActionTime;
                if (timeSinceAction > 5000) {
                    console.log(`[BOT ${this.botName}] Turn checker - taking action`);
                    this.checkAndTakeTurn();
                }
            }
        }, this.config.turnCheckInterval);
    }

    stopTurnChecker() {
        if (this.turnCheckTimer) {
            clearInterval(this.turnCheckTimer);
            this.turnCheckTimer = null;
        }
    }

    joinGame() {
        console.log(`[BOT ${this.botName}] Joining game ${this.gameId} (${this.difficulty.toUpperCase()})...`);
        this.socket.emit('joinGame', {
            gameId: this.gameId,
            playerName: this.botName,
            isBot: true,
            botDifficulty: this.difficulty
        });
    }

    rejoinGame() {
        console.log(`[BOT ${this.botName}] Rejoining game ${this.gameId} (${this.difficulty.toUpperCase()})...`);
        this.socket.emit('rejoinGame', {
            gameId: this.gameId,
            playerName: this.botName,
            isBot: true,
            botDifficulty: this.difficulty
        });
    }

    updateGameState(game) {
        this.gameState = game;
        this.myPlayer = game.players.find(p => p.id === this.socket.id);
        if (this.myPlayer) {
            const myIndex = game.players.indexOf(this.myPlayer);
            this.isMyTurn = game.currentPlayerIndex === myIndex;
        } else {
            this.isMyTurn = false;
        }
    }

    checkAndTakeTurn() {
        if (!this.isMyTurn || !this.gameState?.started || this.actionInProgress) {
            return;
        }

        // Pause if no humans are connected
        const humansConnected = this.gameState.players.some(p => !p.isBot && !p.disconnected && !p.bankrupt);
        if (!humansConnected) {
            console.log(`[BOT ${this.botName}] No active humans - pausing turn`);
            return;
        }

        this.lastActionTime = Date.now();
        this.actionInProgress = true;

        // Consider proposing a trade
        this.considerProposingTrade();

        // Check for pending action first
        if (this.gameState.pendingAction) {
            const delay = this.getRandomDelay('buyProperty'); // Use buyProperty delay for pending actions
            setTimeout(() => this.handlePendingAction(), delay);
            return;
        }

        // Check if in jail
        if (this.myPlayer.inJail) {
            const delay = this.getRandomDelay('jailDecision');
            console.log(`[BOT ${this.botName}] Thinking about jail options... (${Math.round(delay / 1000)}s)`);
            setTimeout(() => this.handleJail(), delay);
            return;
        }

        // Roll dice if we haven't or can roll again
        if (!this.gameState.diceRolled || this.gameState.canRollAgain) {
            const delay = this.getRandomDelay('rollDice');
            console.log(`[BOT ${this.botName}] Getting ready to roll... (${Math.round(delay / 1000)}s)`);
            setTimeout(() => this.rollDice(), delay);
            return;
        }

        this.scheduleEndTurn(this.getRandomDelay('endTurn'));
    }

    rollDice() {
        if (!this.isMyTurn) return;
        console.log(`[BOT ${this.botName}] Rolling dice...`);
        this.lastActionTime = Date.now();
        this.socket.emit('rollDice', { gameId: this.gameId });
    }

    handleJail() {
        if (!this.isMyTurn) return;

        const gamePhase = this.getGamePhase();
        console.log(`[BOT ${this.botName}] In jail (turn ${this.myPlayer.jailTurns}/3, phase: ${gamePhase}, difficulty: ${this.difficulty})`);

        // Use jail card if we have one
        if (this.myPlayer.getOutOfJailCards > 0) {
            console.log(`[BOT ${this.botName}] Using Get Out of Jail card`);
            this.socket.emit('useJailCard', { gameId: this.gameId });
            return;
        }

        // Late game strategy - only smart bots stay in jail to avoid rent
        if (this.config.jailStayLateGame && gamePhase === 'late' && this.myPlayer.jailTurns < 2) {
            console.log(`[BOT ${this.botName}] Staying in jail (late game strategy)`);
            this.socket.emit('rollDice', { gameId: this.gameId });
            return;
        }

        // Pay fine if we have money - threshold varies by difficulty
        if (this.myPlayer.money > this.config.jailPayThreshold && this.myPlayer.jailTurns < 2) {
            console.log(`[BOT ${this.botName}] Paying jail fine`);
            this.socket.emit('payJailFine', { gameId: this.gameId });
            return;
        }

        // Try to roll doubles
        console.log(`[BOT ${this.botName}] Attempting to roll doubles`);
        this.socket.emit('rollDice', { gameId: this.gameId });
    }

    handlePostLanding() {
        if (!this.isMyTurn) {
            this.actionInProgress = false;
            return;
        }

        if (this.gameState.pendingAction) {
            this.handlePendingAction();
        } else if (this.gameState.canRollAgain && !this.myPlayer.inJail) {
            const delay = this.getRandomDelay('rollDice');
            console.log(`[BOT ${this.botName}] Rolling again... (${Math.round(delay / 1000)}s)`);
            setTimeout(() => this.rollDice(), delay);
        } else {
            this.scheduleEndTurn(this.getRandomDelay('endTurn'));
        }
    }

    scheduleEndTurn(delay = null) {
        // Use provided delay or generate a random one
        const actualDelay = delay !== null ? delay : this.getRandomDelay('endTurn');
        setTimeout(() => {
            if (!this.isMyTurn) {
                this.actionInProgress = false;
                return;
            }

            if (this.gameState.pendingAction) {
                this.handlePendingAction();
                return;
            }

            if (this.gameState.auction) {
                this.handleAuction(this.gameState.auction);
                return;
            }

            if (!this.gameState.diceRolled) {
                if (this.myPlayer.inJail) {
                    this.handleJail();
                } else {
                    this.rollDice();
                }
                return;
            }

            if (this.gameState.canRollAgain && !this.myPlayer.inJail) {
                this.rollDice();
                return;
            }

            // Build houses before ending
            this.tryBuildHouses();

            console.log(`[BOT ${this.botName}] Ending turn`);
            this.lastActionTime = Date.now();
            this.socket.emit('endTurn', { gameId: this.gameId });
            this.actionInProgress = false;
        }, actualDelay);
    }

    handlePendingAction() {
        const action = this.gameState.pendingAction;
        if (!action) {
            this.actionInProgress = false;
            this.scheduleEndTurn(this.getRandomDelay('endTurn'));
            return;
        }

        this.lastActionTime = Date.now();

        switch (action.type) {
            case 'buyOrAuction':
                this.decideBuyProperty(action.property);
                break;
            case 'mustRaiseFunds':
            case 'mustPayOrBankrupt':
                this.handleBankruptcyState(action);
                break;
            default:
                console.log(`[BOT ${this.botName}] Unknown pending action: ${action.type}`);
                this.actionInProgress = false;
        }
    }

    decideBuyProperty(property) {
        const shouldBuy = this.evaluateProperty(property);
        const delay = shouldBuy ? this.getRandomDelay('buyProperty') : this.getRandomDelay('declineProperty');

        console.log(`[BOT ${this.botName}] Evaluating ${property.name}... (${Math.round(delay / 1000)}s)`);

        setTimeout(() => {
            if (shouldBuy) {
                console.log(`[BOT ${this.botName}] Buying ${property.name} for £${property.price}`);
                this.socket.emit('buyProperty', { gameId: this.gameId });
            } else {
                console.log(`[BOT ${this.botName}] Declining ${property.name}`);
                this.socket.emit('declineProperty', { gameId: this.gameId });
            }
        }, delay);
    }

    handleBankruptcyState(action) {
        console.log(`[BOT ${this.botName}] Bankruptcy state - Money: £${this.myPlayer.money}`);

        if (this.myPlayer.money >= 0) {
            this.scheduleEndTurn(this.getRandomDelay('endTurn'));
            return;
        }

        // Sell houses from least valuable monopolies first
        const monopolies = this.findOwnedMonopolies().sort((a, b) => {
            const aRank = this.colorGroupRanking[a[0]?.color] || 0;
            const bRank = this.colorGroupRanking[b[0]?.color] || 0;
            return aRank - bRank; // Sell from worst first
        });

        for (const group of monopolies) {
            const maxHouses = Math.max(...group.map(p => p.houses || 0));
            if (maxHouses > 0) {
                const prop = group.find(p => p.houses === maxHouses);
                if (prop) {
                    // Use the index property stored on the board space
                    const propIndex = prop.index !== undefined ? prop.index : this.gameState.board.indexOf(prop);
                    console.log(`[BOT ${this.botName}] Selling house on ${prop.name} (index ${propIndex})`);
                    this.socket.emit('sellHouse', { gameId: this.gameId, propertyIndex: propIndex });
                    return;
                }
            }
        }

        // Mortgage properties (least valuable first)
        // Use board state to find properties we actually own (most reliable source)
        const ownedOnBoard = this.gameState.board.filter(
            space => space.owner === this.myPlayer.id && !space.mortgaged && (space.houses || 0) === 0
        );

        const unmortgaged = ownedOnBoard
            .sort((a, b) => (a.price || 0) - (b.price || 0));

        if (unmortgaged.length > 0) {
            const prop = unmortgaged[0];
            const propIndex = prop.index !== undefined ? prop.index : this.gameState.board.indexOf(prop);
            console.log(`[BOT ${this.botName}] Mortgaging ${prop.name} (index ${propIndex})`);
            this.socket.emit('mortgageProperty', { gameId: this.gameId, propertyIndex: propIndex });
            return;
        }

        // Declare bankruptcy
        console.log(`[BOT ${this.botName}] Declaring bankruptcy`);
        this.socket.emit('declareBankruptcy', { gameId: this.gameId });
        this.actionInProgress = false;
    }

    disconnect() {
        this.stopTurnChecker();
        if (this.socket) {
            this.socket.disconnect();
            console.log(`[BOT ${this.botName}] Disconnected`);
        }
    }
}

module.exports = MonopolyBot;

// CLI support
if (require.main === module) {
    const gameId = process.argv[2];
    if (!gameId) {
        console.log('Usage: node bot.js <GAME_ID>');
        process.exit(1);
    }

    const bot = new MonopolyBot('http://localhost:3001', gameId);
    bot.connect().then(() => {
        bot.joinGame();
    }).catch(console.error);
}
