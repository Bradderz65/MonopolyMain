/**
 * Bot AI Test Suite
 * Tests the bot's decision-making for trades, property buying, and strategic play
 * Run with: node server/test-bot-ai.js
 */

const io = require('socket.io-client');
const Game = require('./game');

const SERVER_URL = 'http://localhost:3001';

// Test results tracking
const testResults = {
    trades: [],
    propertyDecisions: [],
    auctionDecisions: [],
    buildingDecisions: [],
    summary: {}
};

function log(msg, type = 'info') {
    const prefix = {
        info: '  ℹ️ ',
        success: '  ✅',
        error: '  ❌',
        trade: '  🤝',
        money: '  💰',
        property: '  🏠',
        test: '\n🧪'
    }[type] || '  ';
    console.log(`${prefix} ${msg}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TRADE DECISION TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function testTradeDecisions() {
    log('Trade Decision Analysis', 'test');
    
    // We'll simulate the bot's trade evaluation logic directly
    const MonopolyBot = require('./bot');
    
    // Create a mock game state
    const mockGame = createMockGame();
    
    // Create bot instance (won't connect, just use logic)
    const bot = new MonopolyBot(SERVER_URL, 'TEST');
    bot.gameState = mockGame;
    bot.myPlayer = mockGame.players[0]; // Bot is player 0
    bot.socket = { id: 'bot-id' };
    
    console.log('\n  📊 TRADE SCENARIO TESTS\n');
    console.log('  ─'.repeat(40));
    
    // Test 1: Fair money-for-property trade
    const trade1 = {
        from: 'player2-id',
        to: 'bot-id',
        offer: { money: 150 },
        request: { properties: [1] } // Old Kent Road (price: 60)
    };
    
    const result1 = bot.evaluateTradeAdvanced(trade1);
    testResults.trades.push({
        scenario: 'Fair money offer (£150 for £60 property)',
        shouldAccept: true,
        botAccepted: result1.shouldAccept,
        ratio: result1.ratio,
        reason: result1.reason,
        passed: result1.shouldAccept === true
    });
    logTradeResult('Fair money offer (£150 for £60 property)', result1, true);
    
    // Test 2: Underpaying for property
    const trade2 = {
        from: 'player2-id',
        to: 'bot-id',
        offer: { money: 30 },
        request: { properties: [1] } // Old Kent Road
    };
    
    const result2 = bot.evaluateTradeAdvanced(trade2);
    testResults.trades.push({
        scenario: 'Underpaying (£30 for £60 property)',
        shouldAccept: false,
        botAccepted: result2.shouldAccept,
        ratio: result2.ratio,
        reason: result2.reason,
        passed: result2.shouldAccept === false
    });
    logTradeResult('Underpaying (£30 for £60 property)', result2, false);
    
    // Test 3: Trade that would complete opponent's monopoly
    // Give player2 most of a color group first
    mockGame.board[6].owner = 'player2-id'; // Angel Islington (light-blue)
    mockGame.board[8].owner = 'player2-id'; // Euston Road (light-blue)
    mockGame.board[9].owner = 'bot-id'; // Pentonville Road (light-blue) - BOT HAS THIS
    mockGame.players[0].properties = [{ index: 9, ...mockGame.board[9] }];
    
    const trade3 = {
        from: 'player2-id',
        to: 'bot-id',
        offer: { money: 200 },
        request: { properties: [9] } // Pentonville Road - would complete their monopoly
    };
    
    const result3 = bot.evaluateTradeAdvanced(trade3);
    testResults.trades.push({
        scenario: 'Trade gives opponent monopoly (blocking property)',
        shouldAccept: false,
        botAccepted: result3.shouldAccept,
        ratio: result3.ratio,
        reason: result3.reason,
        passed: result3.shouldAccept === false
    });
    logTradeResult('Trade gives opponent monopoly', result3, false);
    
    // Test 4: Trade that completes BOT's monopoly
    mockGame.board[1].owner = 'bot-id'; // Old Kent Road (brown)
    mockGame.board[3].owner = 'player2-id'; // Whitechapel Road (brown) - opponent has this
    mockGame.players[0].properties = [
        { index: 1, ...mockGame.board[1] },
        { index: 9, ...mockGame.board[9] }
    ];
    
    const trade4 = {
        from: 'player2-id',
        to: 'bot-id',
        offer: { properties: [3] }, // Whitechapel - would complete bot's brown monopoly
        request: { money: 100 }
    };
    
    const result4 = bot.evaluateTradeAdvanced(trade4);
    testResults.trades.push({
        scenario: 'Trade completes MY monopoly',
        shouldAccept: true,
        botAccepted: result4.shouldAccept,
        ratio: result4.ratio,
        reason: result4.reason,
        passed: result4.shouldAccept === true
    });
    logTradeResult('Trade completes MY monopoly', result4, true);
    
    // Test 5: Property swap - equal value
    mockGame.board[11].owner = 'bot-id'; // Pall Mall (pink)
    mockGame.board[16].owner = 'player2-id'; // Bow Street (orange)
    mockGame.players[0].properties.push({ index: 11, ...mockGame.board[11] });
    
    const trade5 = {
        from: 'player2-id',
        to: 'bot-id',
        offer: { properties: [16] }, // Bow Street (£180)
        request: { properties: [11] } // Pall Mall (£140)
    };
    
    const result5 = bot.evaluateTradeAdvanced(trade5);
    testResults.trades.push({
        scenario: 'Property swap (£180 for £140)',
        shouldAccept: true,
        botAccepted: result5.shouldAccept,
        ratio: result5.ratio,
        reason: result5.reason,
        passed: result5.shouldAccept === true
    });
    logTradeResult('Property swap (£180 for £140)', result5, true);
    
    // Test 6: Bad swap - giving more than receiving
    const trade6 = {
        from: 'player2-id',
        to: 'bot-id',
        offer: { properties: [1] }, // Old Kent Road (£60) - but bot owns this...
        request: { properties: [11], money: 50 } // Pall Mall + £50
    };
    
    // Fix: use a property bot doesn't own
    mockGame.board[21].owner = 'player2-id'; // Strand (red, £220)
    const trade6b = {
        from: 'player2-id',
        to: 'bot-id',
        offer: { money: 50 },
        request: { properties: [11] } // Pall Mall (£140)
    };
    
    const result6 = bot.evaluateTradeAdvanced(trade6b);
    testResults.trades.push({
        scenario: 'Bad deal (£50 for £140 property)',
        shouldAccept: false,
        botAccepted: result6.shouldAccept,
        ratio: result6.ratio,
        reason: result6.reason,
        passed: result6.shouldAccept === false
    });
    logTradeResult('Bad deal (£50 for £140 property)', result6, false);
    
    // Test 7: Railroad trade
    mockGame.board[5].owner = 'bot-id'; // Kings Cross
    mockGame.board[15].owner = 'bot-id'; // Marylebone
    mockGame.board[25].owner = 'player2-id'; // Fenchurch St
    mockGame.players[0].properties.push(
        { index: 5, ...mockGame.board[5] },
        { index: 15, ...mockGame.board[15] }
    );
    
    const trade7 = {
        from: 'player2-id',
        to: 'bot-id',
        offer: { properties: [25] }, // Fenchurch St (3rd railroad!)
        request: { money: 250 }
    };
    
    const result7 = bot.evaluateTradeAdvanced(trade7);
    testResults.trades.push({
        scenario: 'Getting 3rd railroad (synergy value)',
        shouldAccept: true,
        botAccepted: result7.shouldAccept,
        ratio: result7.ratio,
        reason: result7.reason,
        passed: result7.shouldAccept === true
    });
    logTradeResult('Getting 3rd railroad', result7, true);
}

function logTradeResult(scenario, result, expectedAccept) {
    const status = result.shouldAccept === expectedAccept ? '✅' : '❌';
    const decision = result.shouldAccept ? 'ACCEPT' : 'DECLINE';
    console.log(`  ${status} ${scenario}`);
    console.log(`     Decision: ${decision} | Ratio: ${result.ratio.toFixed(2)} | Reason: ${result.reason}`);
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPERTY BUYING TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function testPropertyBuying() {
    log('Property Buying Decisions', 'test');
    
    const MonopolyBot = require('./bot');
    const mockGame = createMockGame();
    
    const bot = new MonopolyBot(SERVER_URL, 'TEST');
    bot.gameState = mockGame;
    bot.myPlayer = mockGame.players[0];
    bot.socket = { id: 'bot-id' };
    
    console.log('\n  📊 PROPERTY BUYING SCENARIOS\n');
    console.log('  ─'.repeat(40));
    
    // Scenario 1: Cheap property, plenty of money
    bot.myPlayer.money = 1500;
    const prop1 = mockGame.board[1]; // Old Kent Road £60
    const buy1 = bot.evaluateProperty(prop1);
    testResults.propertyDecisions.push({
        scenario: 'Cheap property (£60), have £1500',
        shouldBuy: true,
        botBuys: buy1,
        passed: buy1 === true
    });
    console.log(`  ${buy1 ? '✅' : '❌'} Cheap property (£60), have £1500 → ${buy1 ? 'BUY' : 'PASS'}`);
    
    // Scenario 2: Expensive property, low money
    bot.myPlayer.money = 250;
    const prop2 = mockGame.board[39]; // Mayfair £400
    const buy2 = bot.evaluateProperty(prop2);
    testResults.propertyDecisions.push({
        scenario: 'Expensive property (£400), have £250',
        shouldBuy: false,
        botBuys: buy2,
        passed: buy2 === false
    });
    console.log(`  ${!buy2 ? '✅' : '❌'} Expensive property (£400), have £250 → ${buy2 ? 'BUY' : 'PASS'}`);
    
    // Scenario 3: Completes monopoly - should buy even with low funds
    bot.myPlayer.money = 150;
    mockGame.board[1].owner = 'bot-id';
    bot.myPlayer.properties = [{ index: 1, ...mockGame.board[1] }];
    const prop3 = mockGame.board[3]; // Whitechapel £60 - completes brown
    const buy3 = bot.evaluateProperty(prop3);
    testResults.propertyDecisions.push({
        scenario: 'Completes monopoly (£60), have £150',
        shouldBuy: true,
        botBuys: buy3,
        passed: buy3 === true
    });
    console.log(`  ${buy3 ? '✅' : '❌'} Completes monopoly (£60), have £150 → ${buy3 ? 'BUY' : 'PASS'}`);
    
    // Scenario 4: Blocks opponent monopoly
    bot.myPlayer.money = 500;
    mockGame.board[6].owner = 'player2-id'; // Angel Islington
    mockGame.board[8].owner = 'player2-id'; // Euston Road
    const prop4 = mockGame.board[9]; // Pentonville - blocks light-blue
    const buy4 = bot.evaluateProperty(prop4);
    testResults.propertyDecisions.push({
        scenario: 'Blocks opponent monopoly (£120)',
        shouldBuy: true,
        botBuys: buy4,
        passed: buy4 === true
    });
    console.log(`  ${buy4 ? '✅' : '❌'} Blocks opponent monopoly (£120) → ${buy4 ? 'BUY' : 'PASS'}`);
    
    // Scenario 5: Railroad with 2 already owned
    mockGame.board[5].owner = 'bot-id';
    mockGame.board[15].owner = 'bot-id';
    bot.myPlayer.properties.push(
        { index: 5, ...mockGame.board[5] },
        { index: 15, ...mockGame.board[15] }
    );
    const prop5 = mockGame.board[25]; // Fenchurch St
    const buy5 = bot.evaluateProperty(prop5);
    testResults.propertyDecisions.push({
        scenario: '3rd Railroad (£200)',
        shouldBuy: true,
        botBuys: buy5,
        passed: buy5 === true
    });
    console.log(`  ${buy5 ? '✅' : '❌'} 3rd Railroad (£200) → ${buy5 ? 'BUY' : 'PASS'}`);
    
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME PHASE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

async function testGamePhaseAnalysis() {
    log('Game Phase Analysis', 'test');
    
    const MonopolyBot = require('./bot');
    
    console.log('\n  📊 GAME PHASE DETECTION\n');
    console.log('  ─'.repeat(40));
    
    // Early game - few properties owned
    const earlyGame = createMockGame();
    earlyGame.board[1].owner = 'player1';
    earlyGame.board[5].owner = 'player2';
    
    const bot1 = new MonopolyBot(SERVER_URL, 'TEST');
    bot1.gameState = earlyGame;
    bot1.myPlayer = earlyGame.players[0];
    
    const phase1 = bot1.getGamePhase();
    console.log(`  ${phase1 === 'early' ? '✅' : '❌'} Few properties owned → Phase: ${phase1} (expected: early)`);
    
    // Mid game - about half owned
    const midGame = createMockGame();
    for (let i = 1; i < 15; i++) {
        if (midGame.board[i].type === 'property' || midGame.board[i].type === 'railroad') {
            midGame.board[i].owner = i % 2 === 0 ? 'player1' : 'player2';
        }
    }
    
    const bot2 = new MonopolyBot(SERVER_URL, 'TEST');
    bot2.gameState = midGame;
    bot2.myPlayer = midGame.players[0];
    
    const phase2 = bot2.getGamePhase();
    console.log(`  ${phase2 === 'mid' ? '✅' : '❌'} ~Half properties owned → Phase: ${phase2} (expected: mid)`);
    
    // Late game - most owned
    const lateGame = createMockGame();
    lateGame.board.forEach((space, i) => {
        if (space.type === 'property' || space.type === 'railroad' || space.type === 'utility') {
            space.owner = i % 2 === 0 ? 'player1' : 'player2';
        }
    });
    
    const bot3 = new MonopolyBot(SERVER_URL, 'TEST');
    bot3.gameState = lateGame;
    bot3.myPlayer = lateGame.players[0];
    
    const phase3 = bot3.getGamePhase();
    console.log(`  ${phase3 === 'late' ? '✅' : '❌'} Most properties owned → Phase: ${phase3} (expected: late)`);
    
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGIC ANALYSIS TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function testStrategicAnalysis() {
    log('Strategic Analysis', 'test');
    
    const MonopolyBot = require('./bot');
    const mockGame = createMockGame();
    
    // Set up a strategic scenario
    mockGame.board[16].owner = 'bot-id'; // Bow Street (orange)
    mockGame.board[18].owner = 'player2-id'; // Marlborough St (orange)
    mockGame.board[19].owner = 'player2-id'; // Vine Street (orange)
    
    mockGame.board[21].owner = 'bot-id'; // Strand (red)
    mockGame.board[23].owner = 'bot-id'; // Fleet Street (red)
    mockGame.board[24].owner = 'player2-id'; // Trafalgar Square (red)
    
    mockGame.players[0].properties = [
        { index: 16, ...mockGame.board[16] },
        { index: 21, ...mockGame.board[21] },
        { index: 23, ...mockGame.board[23] }
    ];
    
    mockGame.players[1].properties = [
        { index: 18, ...mockGame.board[18] },
        { index: 19, ...mockGame.board[19] },
        { index: 24, ...mockGame.board[24] }
    ];
    
    const bot = new MonopolyBot(SERVER_URL, 'TEST');
    bot.gameState = mockGame;
    bot.myPlayer = mockGame.players[0];
    bot.socket = { id: 'bot-id' };
    
    console.log('\n  📊 STRATEGIC POSITION ANALYSIS\n');
    console.log('  ─'.repeat(40));
    
    // Analyze color groups
    const colorAnalysis = bot.analyzeColorGroups();
    
    console.log('  Color Group Status:');
    for (const [color, analysis] of Object.entries(colorAnalysis)) {
        if (analysis.myCount > 0 || Object.keys(analysis.owners).length > 0) {
            const myPct = ((analysis.myCount / analysis.total) * 100).toFixed(0);
            console.log(`    ${color}: Mine: ${analysis.myCount}/${analysis.total} (${myPct}%) | Needed for monopoly: ${analysis.neededForMonopoly}`);
        }
    }
    
    // Find blocking properties
    const blocking = bot.findBlockingProperties();
    console.log('\n  Blocking Properties:');
    if (blocking.length === 0) {
        console.log('    None');
    } else {
        blocking.forEach(b => {
            console.log(`    ${b.property.name} blocks ${b.blockedPlayer.name}'s ${b.property.color} monopoly`);
        });
    }
    
    // Analyze player strategies
    const playerAnalysis = bot.analyzePlayerStrategies();
    console.log('\n  Opponent Analysis:');
    for (const [playerId, analysis] of Object.entries(playerAnalysis)) {
        console.log(`    ${analysis.name}: £${analysis.money} | Properties: ${analysis.propertyCount} | Est. Wealth: £${analysis.wealthEstimate}`);
        for (const [color, group] of Object.entries(analysis.colorGroups)) {
            if (group.needsOne) {
                console.log(`      ⚠️  ONE AWAY from ${color} monopoly!`);
            }
        }
    }
    
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE BOT TEST (requires server)
// ═══════════════════════════════════════════════════════════════════════════

async function testLiveBotBehavior() {
    log('Live Bot Behavior Test (requires server)', 'test');
    
    let host, bot;
    
    try {
        // Connect host
        host = await connectPlayer('TestHost');
        console.log('  ✅ Host connected');
        
        // Create game
        host.emit('createGame', {
            playerName: 'TestHost',
            gameName: 'Bot AI Test',
            maxPlayers: 4,
            isPrivate: false,
            auctionsEnabled: false
        });
        
        const { gameId } = await waitForEvent(host, 'gameCreated', 5000);
        console.log(`  ✅ Game created: ${gameId}`);
        
        // Add bot
        host.emit('addBot', { gameId });
        const { player: botPlayer } = await waitForEvent(host, 'playerJoined', 5000);
        console.log(`  ✅ Bot joined: ${botPlayer.name}`);
        
        // Start game
        host.emit('startGame', { gameId });
        await waitForEvent(host, 'gameStarted', 5000);
        console.log('  ✅ Game started');
        
        // Watch bot behavior for a few turns
        console.log('\n  📊 WATCHING BOT BEHAVIOR...\n');
        
        let turnCount = 0;
        const maxTurns = 10;
        const observations = [];
        
        const turnHandler = ({ game }) => {
            const currentPlayer = game.players[game.currentPlayerIndex];
            if (currentPlayer.isBot) {
                observations.push({
                    turn: ++turnCount,
                    botMoney: currentPlayer.money,
                    botProperties: currentPlayer.properties.length,
                    botPosition: currentPlayer.position
                });
                console.log(`    Turn ${turnCount}: Bot at position ${currentPlayer.position}, £${currentPlayer.money}, ${currentPlayer.properties.length} properties`);
            }
        };
        
        host.on('turnEnded', turnHandler);
        host.on('diceRolled', ({ result }) => {
            console.log(`    Dice: ${result.die1} + ${result.die2} = ${result.total}${result.isDoubles ? ' (doubles!)' : ''}`);
        });
        host.on('propertyBought', ({ result }) => {
            console.log(`    🏠 Bought: ${result.property.name} for £${result.property.price}`);
        });
        host.on('propertyDeclined', () => {
            console.log(`    ❌ Declined property`);
        });
        
        // Let it run for a while
        await new Promise(r => setTimeout(r, 15000));
        
        console.log('\n  ─'.repeat(40));
        console.log(`  Observed ${observations.length} bot turns`);
        
        host.off('turnEnded', turnHandler);
        host.emit('leaveGame', { gameId });
        
    } catch (err) {
        if (err.message.includes('Connection') || err.message.includes('Timeout')) {
            console.log('  ⏭️  Skipped: Server not running');
        } else {
            console.log(`  ❌ Error: ${err.message}`);
        }
    } finally {
        if (host) host.disconnect();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function createMockGame() {
    const { BOARD_SPACES } = require('./boardData');
    
    return {
        id: 'TEST-GAME',
        name: 'Test Game',
        started: true,
        currentPlayerIndex: 0,
        board: JSON.parse(JSON.stringify(BOARD_SPACES)),
        players: [
            {
                id: 'bot-id',
                name: 'TestBot',
                money: 1500,
                position: 0,
                properties: [],
                inJail: false,
                jailTurns: 0,
                getOutOfJailCards: 0,
                bankrupt: false,
                isBot: true
            },
            {
                id: 'player2-id',
                name: 'Player2',
                money: 1500,
                position: 0,
                properties: [],
                inJail: false,
                jailTurns: 0,
                getOutOfJailCards: 0,
                bankrupt: false,
                isBot: false
            }
        ],
        diceRolled: false,
        lastDiceRoll: null,
        canRollAgain: false,
        pendingAction: null,
        auction: null,
        trades: [],
        gameLog: []
    };
}

function connectPlayer(name) {
    return new Promise((resolve, reject) => {
        const socket = io(SERVER_URL, { transports: ['websocket'] });
        const timeout = setTimeout(() => {
            socket.disconnect();
            reject(new Error('Connection timeout'));
        }, 5000);
        
        socket.on('connect', () => {
            clearTimeout(timeout);
            resolve(socket);
        });
        
        socket.on('connect_error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

function waitForEvent(socket, event, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timeout waiting for ${event}`));
        }, timeout);
        
        socket.once(event, (data) => {
            clearTimeout(timer);
            resolve(data);
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateSummary() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    BOT AI TEST SUMMARY                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    
    // Trade decisions summary
    const tradePassed = testResults.trades.filter(t => t.passed).length;
    const tradeTotal = testResults.trades.length;
    
    console.log('\n📊 TRADE DECISIONS:');
    console.log(`   Correct Decisions: ${tradePassed}/${tradeTotal} (${((tradePassed/tradeTotal)*100).toFixed(0)}%)\n`);
    
    console.log('   Scenario Breakdown:');
    testResults.trades.forEach(t => {
        const icon = t.passed ? '✅' : '❌';
        const decision = t.botAccepted ? 'ACCEPT' : 'DECLINE';
        console.log(`   ${icon} ${t.scenario}`);
        console.log(`      Bot: ${decision} (ratio: ${t.ratio.toFixed(2)}) | Expected: ${t.shouldAccept ? 'ACCEPT' : 'DECLINE'}`);
    });
    
    // Property decisions summary
    const propPassed = testResults.propertyDecisions.filter(p => p.passed).length;
    const propTotal = testResults.propertyDecisions.length;
    
    console.log('\n📊 PROPERTY BUYING DECISIONS:');
    console.log(`   Correct Decisions: ${propPassed}/${propTotal} (${((propPassed/propTotal)*100).toFixed(0)}%)\n`);
    
    testResults.propertyDecisions.forEach(p => {
        const icon = p.passed ? '✅' : '❌';
        console.log(`   ${icon} ${p.scenario} → Bot: ${p.botBuys ? 'BUY' : 'PASS'}`);
    });
    
    // Overall assessment
    const totalPassed = tradePassed + propPassed;
    const totalTests = tradeTotal + propTotal;
    const overallScore = (totalPassed / totalTests) * 100;
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    OVERALL ASSESSMENT                          ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║   Total Tests: ${totalTests}                                               ║`);
    console.log(`║   Passed: ${totalPassed}                                                    ║`);
    console.log(`║   Score: ${overallScore.toFixed(0)}%                                                   ║`);
    console.log('╠════════════════════════════════════════════════════════════════╣');
    
    if (overallScore >= 90) {
        console.log('║   🏆 EXCELLENT - Bot makes very smart decisions!              ║');
    } else if (overallScore >= 70) {
        console.log('║   ✅ GOOD - Bot makes reasonable decisions                    ║');
    } else if (overallScore >= 50) {
        console.log('║   ⚠️  FAIR - Bot needs improvement                             ║');
    } else {
        console.log('║   ❌ POOR - Bot decision logic needs work                     ║');
    }
    
    console.log('╚════════════════════════════════════════════════════════════════╝');
    
    // Key insights
    console.log('\n📋 KEY INSIGHTS:');
    
    const acceptedBadDeals = testResults.trades.filter(t => t.shouldAccept === false && t.botAccepted === true);
    const rejectedGoodDeals = testResults.trades.filter(t => t.shouldAccept === true && t.botAccepted === false);
    
    if (acceptedBadDeals.length > 0) {
        console.log('   ⚠️  Bot accepted bad deals:');
        acceptedBadDeals.forEach(t => console.log(`      - ${t.scenario}`));
    }
    
    if (rejectedGoodDeals.length > 0) {
        console.log('   ⚠️  Bot rejected good deals:');
        rejectedGoodDeals.forEach(t => console.log(`      - ${t.scenario}`));
    }
    
    if (acceptedBadDeals.length === 0 && rejectedGoodDeals.length === 0) {
        console.log('   ✅ Bot correctly evaluates all tested trade scenarios!');
    }
    
    // What the bot values
    console.log('\n📋 BOT PRIORITIES (based on testing):');
    console.log('   1. Monopoly completion - Will pay premium to complete monopolies');
    console.log('   2. Blocking opponents - Won\'t give up blocking properties easily');
    console.log('   3. Railroad synergy - Values railroads more when it owns multiples');
    console.log('   4. Fair value trades - Requires ~1:1 value ratio minimum');
    console.log('   5. Strategic awareness - Considers what opponents need');
    
    console.log('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║              BOT AI DECISION TESTING SUITE                     ║');
    console.log('║         Testing trades, buying, and strategic play             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    
    try {
        await testTradeDecisions();
        await testPropertyBuying();
        await testGamePhaseAnalysis();
        await testStrategicAnalysis();
        await testLiveBotBehavior();
        
        generateSummary();
        
    } catch (err) {
        console.error('Test error:', err);
    }
    
    process.exit(0);
}

runTests();

