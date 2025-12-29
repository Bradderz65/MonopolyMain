/**
 * Monopoly AI Bot - Advanced Strategic AI
 * Features:
 * - Tracks all player properties and board state
 * - Proactively proposes beneficial trades
 * - Blocks opponent monopolies
 * - Smart property valuation based on game context
 * - Strategic building decisions
 * - Adaptive play style based on game phase
 */

const io = require('socket.io-client');

const BOT_NAMES = ['RoboTycoon', 'MonopolyMaster', 'PropertyKing', 'LandBaron', 'RealEstateBot', 'WealthBot'];

class MonopolyBot {
    constructor(serverUrl, gameId, botName = null) {
        this.serverUrl = serverUrl;
        this.gameId = gameId;
        this.botName = botName || BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        this.socket = null;
        this.gameState = null;
        this.myPlayer = null;
        this.isMyTurn = false;
        this.actionInProgress = false;
        this.turnCheckTimer = null;
        this.lastActionTime = Date.now();
        this.tradeAttempts = new Map(); // Track trade attempts to avoid spam
        this.lastTradeTime = 0;
        this.declinedTrades = new Map(); // Track trades declined by players - key: "playerId-propIndex", value: { count, lastPrice, timestamp }
        this.receivedTradeHistory = new Map(); // Track trades we've received and declined - key: "fromId-tradeHash", value: { count, timestamp }

        // Strategy settings - adaptive based on game phase
        this.config = {
            // Property buying
            buyPropertyThreshold: 0.25,
            minCashReserve: 100,

            // Building
            buildWhenCashAbove: 300,
            maxBuildingSpend: 0.6, // Don't spend more than 60% of cash on buildings

            // Auctions
            auctionAggressiveness: 0.85,

            // Trading
            tradeCheckInterval: 15000, // Check for trades every 15 seconds
            minTradeValue: 50, // Minimum value difference to consider trade

            // Timing
            actionDelay: 1500,
            turnCheckInterval: 3000,
        };

        // Color group values (higher = more valuable for monopoly)
        this.colorGroupRanking = {
            'orange': 10,    // Best ROI, high traffic
            'red': 9,        // High traffic
            'yellow': 8,     // Good value
            'light-blue': 7, // Cheap to build, good early
            'pink': 6,       // Decent
            'green': 5,      // Expensive but good rent
            'dark-blue': 4,  // Very expensive, fewer properties
            'brown': 3,      // Cheap but low rent
        };
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
                setTimeout(() => this.handlePostLanding(), 3500);
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
            setTimeout(() => this.handleAuction(auction), 1000);
        });

        this.socket.on('auctionUpdate', ({ auction, game }) => {
            this.updateGameState(game);
            if (auction) {
                setTimeout(() => this.handleAuction(auction), 1000);
            } else if (this.isMyTurn) {
                this.scheduleEndTurn(500);
            }
        });

        this.socket.on('turnEnded', ({ game }) => {
            this.updateGameState(game);
            this.actionInProgress = false;
            this.checkAndTakeTurn();
        });

        this.socket.on('jailFinePaid', ({ game }) => {
            this.updateGameState(game);
            setTimeout(() => this.rollDice(), 500);
        });

        this.socket.on('jailCardUsed', ({ game }) => {
            this.updateGameState(game);
            setTimeout(() => this.rollDice(), 500);
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
                setTimeout(() => this.handleBankruptcyState(this.gameState.pendingAction), 500);
            }
        });

        this.socket.on('propertyMortgaged', ({ game }) => {
            this.updateGameState(game);
            if (this.gameState.pendingAction?.type === 'mustRaiseFunds' ||
                this.gameState.pendingAction?.type === 'mustPayOrBankrupt') {
                setTimeout(() => this.handleBankruptcyState(this.gameState.pendingAction), 500);
            } else if (this.isMyTurn && !this.gameState.pendingAction) {
                this.scheduleEndTurn(500);
            }
        });

        this.socket.on('playerBankrupt', ({ game }) => {
            this.updateGameState(game);
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
                const prop = typeof propData === 'number' ? this.gameState.board[propData] : propData;
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
            const prop = typeof propData === 'number' ? this.gameState.board[propData] : propData;
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
            const prop = typeof propData === 'number' ? this.gameState.board[propData] : propData;
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
                setTimeout(() => {
                    this.socket.emit('declineTrade', { gameId: this.gameId, tradeId: trade.id });
                }, 1000);
                return;
            }
        }

        const evaluation = this.evaluateTradeAdvanced(trade);

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
        }, 2000 + Math.random() * 2000);
    }

    /**
     * Advanced trade evaluation considering strategic value
     * Bot acts like a smart player - won't accept bad deals even for high money
     */
    evaluateTradeAdvanced(trade) {
        let receivingValue = trade.offer?.money || 0;
        let givingValue = trade.request?.money || 0;
        let strategicBonus = 0;
        let strategicPenalty = 0;
        let isBlockingProperty = false;
        let wouldGiveMonopoly = false;

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
        for (const propIndex of (trade.request?.properties || [])) {
            const property = this.gameState.board[propIndex];
            const baseValue = this.calculatePropertyValueAdvanced(property, 'giving');
            givingValue += baseValue;

            // Penalty if this gives opponent a monopoly
            const blocked = this.wouldGiveOpponentMonopoly(property);
            if (blocked) {
                wouldGiveMonopoly = true;
                // Much higher penalty - never want to give monopolies easily
                strategicPenalty += property.price * 2.0;
                console.log(`[BOT ${this.botName}] Trade would give ${blocked.name} a monopoly!`);
            }

            // Extra penalty if we're blocking someone's monopoly
            const blocking = this.findBlockingProperties().find(b =>
                b.property.index === propIndex
            );
            if (blocking) {
                isBlockingProperty = true;
                // Blocking properties are VERY valuable - don't trade easily
                strategicPenalty += property.price * 1.5;
                console.log(`[BOT ${this.botName}] This property blocks ${blocking.blockedPlayer.name}'s monopoly!`);
            }
        }

        // Jail cards
        receivingValue += (trade.offer?.jailCards || 0) * 50;
        givingValue += (trade.request?.jailCards || 0) * 50;

        const adjustedReceiving = receivingValue + strategicBonus;
        const adjustedGiving = givingValue + strategicPenalty;

        // Calculate ratio - require better deal for strategic properties
        let requiredRatio = 1.0;
        if (wouldGiveMonopoly) {
            requiredRatio = 1.8; // Need 80% better deal to give away monopoly-completing property
        } else if (isBlockingProperty) {
            requiredRatio = 1.5; // Need 50% better deal for blocking property
        }

        const ratio = adjustedReceiving / Math.max(adjustedGiving, 1);

        // Additional check: if they're only offering money for a strategic property, 
        // apply extra scrutiny (players often try to lowball bots)
        let shouldAccept = ratio >= requiredRatio;

        if (shouldAccept && (trade.request?.properties || []).length > 0) {
            // Check if offer is mainly cash for properties
            const cashOnlyOffer = (trade.offer?.properties || []).length === 0;
            const requestedProps = trade.request?.properties || [];

            if (cashOnlyOffer && requestedProps.length > 0) {
                // Someone is offering only money for our properties
                // Be more conservative - require significantly more
                const totalRequestedValue = requestedProps.reduce((sum, idx) => {
                    const prop = this.gameState.board[idx];
                    return sum + (prop?.price || 0);
                }, 0);

                const cashOffer = trade.offer?.money || 0;
                const cashRatio = cashOffer / totalRequestedValue;

                // For cash-only trades, require at least 1.5x property value
                // For blocking properties, require 2.5x+ 
                const minCashMultiplier = isBlockingProperty ? 2.5 : (wouldGiveMonopoly ? 3.0 : 1.5);

                if (cashRatio < minCashMultiplier) {
                    shouldAccept = false;
                    console.log(`[BOT ${this.botName}] Cash offer too low: £${cashOffer} for £${totalRequestedValue} worth of properties (need ${minCashMultiplier}x)`);
                }
            }
        }

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
                const offer = this.findTradeOffer(owner, neededProp);
                if (offer) {
                    console.log(`[BOT ${this.botName}] Proposing trade to ${owner.name} for ${neededProp.name}`);

                    // Track this trade attempt
                    const existingAttempt = this.tradeAttempts.get(tradeKey) || { declineCount: 0 };
                    this.tradeAttempts.set(tradeKey, {
                        timestamp: Date.now(),
                        declineCount: existingAttempt.declineCount + 1
                    });
                    this.lastTradeTime = Date.now();

                    this.socket.emit('proposeTrade', {
                        gameId: this.gameId,
                        targetPlayerId: owner.id,
                        offer: offer.offer,
                        request: { properties: [neededProp.index] }
                    });
                    return;
                }
            }
        }
    }

    /**
     * Find a fair trade offer for a property we want
     */
    findTradeOffer(targetPlayer, wantedProperty) {
        const wantedValue = this.calculatePropertyValueAdvanced(wantedProperty, 'receiving');

        // Try money offer first if we're rich
        if (this.myPlayer.money > wantedValue * 1.5 + this.config.minCashReserve) {
            // Offer 20-40% premium for monopoly-completing properties
            const premium = this.wouldCompleteMyMonopoly(wantedProperty) ? 1.4 : 1.2;
            const moneyOffer = Math.floor(wantedValue * premium);

            if (moneyOffer <= this.myPlayer.money - this.config.minCashReserve) {
                return {
                    offer: { money: moneyOffer },
                    expectedAcceptance: 0.6,
                };
            }
        }

        // Try property swap
        // Find properties we own that might interest them
        const theirAnalysis = this.analyzePlayerStrategies()[targetPlayer.id];
        if (!theirAnalysis) return null;

        // Find properties that would help them toward a monopoly
        for (const propData of this.myPlayer.properties) {
            const prop = typeof propData === 'number' ? this.gameState.board[propData] : propData;
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

                // Add money to balance if needed
                const diff = wantedValue - propValue;
                let moneyComponent = 0;

                if (diff > 0 && diff <= this.myPlayer.money - this.config.minCashReserve) {
                    moneyComponent = Math.floor(diff);
                }

                if (propValue + moneyComponent >= wantedValue * 0.9) {
                    return {
                        offer: {
                            properties: [prop.index || this.gameState.board.indexOf(prop)],
                            money: moneyComponent > 0 ? moneyComponent : undefined,
                        },
                        expectedAcceptance: 0.4,
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

        // Adjust cash reserve based on game phase
        const reserveNeeded = gamePhase === 'early' ? 50 :
            gamePhase === 'mid' ? 100 : 150;

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

        // Monopoly completion - highest priority
        if (this.wouldCompleteMyMonopoly(property)) {
            score += 0.7;
            console.log(`[BOT ${this.botName}] ${property.name} would complete monopoly!`);
        } else {
            // Progress toward monopoly
            const progress = this.getColorGroupProgress(property);
            score += progress * 0.3;
        }

        // Block opponent monopoly - very important
        const blocked = this.wouldCompleteOpponentMonopoly(property);
        if (blocked) {
            score += 0.5;
            console.log(`[BOT ${this.botName}] ${property.name} blocks ${blocked.name}'s monopoly!`);
        }

        // Color group value
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

        console.log(`[BOT ${this.botName}] ${property.name} score: ${score.toFixed(2)} (phase: ${gamePhase})`);

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
        const buildDelay = 150; // Delay between each build request (ms)

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

    handleAuction(auction) {
        if (!auction || !this.myPlayer) return;
        if (auction.passedPlayers?.includes(this.myPlayer.id)) return;

        const property = auction.property;
        const currentBid = auction.currentBid || 0;
        const minBid = Math.max(auction.minimumBid || 10, currentBid + 1);

        // Calculate max we'd pay with strategic considerations
        let maxBid = property.price * this.config.auctionAggressiveness;

        // Much higher for monopoly completion
        if (this.wouldCompleteMyMonopoly(property)) {
            maxBid = property.price * 1.8;
            console.log(`[BOT ${this.botName}] Bidding aggressively - completes monopoly`);
        }

        // Higher to block opponent monopoly
        const blocked = this.wouldCompleteOpponentMonopoly(property);
        if (blocked) {
            maxBid = Math.max(maxBid, property.price * 1.3);
            console.log(`[BOT ${this.botName}] Bidding to block ${blocked.name}`);
        }

        // Railroad synergy
        if (property.type === 'railroad' && this.getRailroadCount() >= 2) {
            maxBid = property.price * 1.2;
        }

        const canAfford = this.myPlayer.money - this.config.minCashReserve;
        maxBid = Math.min(maxBid, canAfford);

        if (minBid <= maxBid) {
            // Strategic bid increment
            let bidAmount = minBid;

            // Small random increment to seem more human
            const increment = Math.floor(Math.random() * 15) + 5;
            bidAmount = Math.min(minBid + increment, maxBid);

            console.log(`[BOT ${this.botName}] Bidding £${bidAmount} on ${property.name} (max: £${Math.floor(maxBid)})`);

            setTimeout(() => {
                this.socket.emit('auctionBid', { gameId: this.gameId, amount: bidAmount });
            }, 1000 + Math.random() * 1500);
        } else {
            console.log(`[BOT ${this.botName}] Passing on ${property.name} (min: £${minBid}, max: £${Math.floor(maxBid)})`);
            setTimeout(() => {
                this.socket.emit('auctionPass', { gameId: this.gameId });
            }, 500);
        }
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
        console.log(`[BOT ${this.botName}] Joining game ${this.gameId}...`);
        this.socket.emit('joinGame', {
            gameId: this.gameId,
            playerName: this.botName,
            isBot: true
        });
    }

    rejoinGame() {
        console.log(`[BOT ${this.botName}] Rejoining game ${this.gameId}...`);
        this.socket.emit('rejoinGame', {
            gameId: this.gameId,
            playerName: this.botName,
            isBot: true
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

        this.lastActionTime = Date.now();
        this.actionInProgress = true;

        // Consider proposing a trade
        this.considerProposingTrade();

        // Check for pending action first
        if (this.gameState.pendingAction) {
            setTimeout(() => this.handlePendingAction(), this.config.actionDelay);
            return;
        }

        // Check if in jail
        if (this.myPlayer.inJail) {
            setTimeout(() => this.handleJail(), this.config.actionDelay);
            return;
        }

        // Roll dice if we haven't or can roll again
        if (!this.gameState.diceRolled || this.gameState.canRollAgain) {
            this.rollDice();
            return;
        }

        this.scheduleEndTurn(500);
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
        console.log(`[BOT ${this.botName}] In jail (turn ${this.myPlayer.jailTurns}/3, phase: ${gamePhase})`);

        // Use jail card if we have one
        if (this.myPlayer.getOutOfJailCards > 0) {
            console.log(`[BOT ${this.botName}] Using Get Out of Jail card`);
            this.socket.emit('useJailCard', { gameId: this.gameId });
            return;
        }

        // Late game: stay in jail longer to avoid rent
        if (gamePhase === 'late' && this.myPlayer.jailTurns < 2) {
            console.log(`[BOT ${this.botName}] Staying in jail (late game strategy)`);
            this.socket.emit('rollDice', { gameId: this.gameId });
            return;
        }

        // Pay fine if we have money and it's early/mid game
        if (this.myPlayer.money > 200 && this.myPlayer.jailTurns < 2) {
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
            setTimeout(() => this.rollDice(), 1000);
        } else {
            this.scheduleEndTurn(1000);
        }
    }

    scheduleEndTurn(delay = 500) {
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
        }, delay);
    }

    handlePendingAction() {
        const action = this.gameState.pendingAction;
        if (!action) {
            this.actionInProgress = false;
            this.scheduleEndTurn(500);
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

        if (shouldBuy) {
            console.log(`[BOT ${this.botName}] Buying ${property.name} for £${property.price}`);
            this.socket.emit('buyProperty', { gameId: this.gameId });
        } else {
            console.log(`[BOT ${this.botName}] Declining ${property.name}`);
            this.socket.emit('declineProperty', { gameId: this.gameId });
        }
    }

    handleBankruptcyState(action) {
        console.log(`[BOT ${this.botName}] Bankruptcy state - Money: £${this.myPlayer.money}`);

        if (this.myPlayer.money >= 0) {
            this.scheduleEndTurn(500);
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
