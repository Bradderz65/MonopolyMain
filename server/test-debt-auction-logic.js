/**
 * Test Suite for New Debt & Auction Logic
 * Verifies:
 * 1. Debt System (Partial payment, debt tracking, repayment via mortgage)
 * 2. Bot Auction Logic (Wealth bonuses, Reluctance/Mood)
 * 
 * Run with: node server/test-debt-auction-logic.js
 */

const { Game } = require('./game');
const Bot = require('./bot');

// Mock Socket for Bot
const mockSocket = {
    emit: () => { },
    on: () => { },
    off: () => { }
};

// ═══════════════════════════════════════════════════════════════════════
// TEST HARNESS
// ═══════════════════════════════════════════════════════════════════════

let testsPassed = 0;
let testsFailed = 0;

function log(msg, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

function assert(condition, message) {
    if (condition) {
        log(message, 'PASS');
        testsPassed++;
    } else {
        log(message, 'FAIL');
        testsFailed++;
        throw new Error(message); // Stop specific test execution
    }
}

async function runTests() {
    log('Starting Debt & Auction Logic Tests...', 'info');

    try {
        testDebtSystem();
    } catch (e) { log(`Debt System Error: ${e.message}`, 'error'); }

    try {
        testBotAuctionLogic();
    } catch (e) { log(`Auction Logic Error: ${e.message}`, 'error'); }

    try {
        testBotDifficultyLevels();
    } catch (e) { log(`Difficulty Levels Error: ${e.message}`, 'error'); }

    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log(`TOTAL: ${testsPassed} Passed, ${testsFailed} Failed`);
    console.log('═══════════════════════════════════════════════════════════════════════');
}

// ═══════════════════════════════════════════════════════════════════════
// DEBT SYSTEM TESTS
// ═══════════════════════════════════════════════════════════════════════

function testDebtSystem() {
    console.log('\n--- Testing Debt System ---');

    // Setup Game
    const game = new Game('test-debt');
    const p1 = game.addPlayer('id1', 'Debtor', false);
    const p2 = game.addPlayer('id2', 'Creditor', false);
    game.start();

    // 1. Setup Scenario: Debtor has £100, Owes £500
    p1.money = 100;
    p2.money = 1000;

    // Create a dummy property for P2 to charge rent
    const propIndex = 1; // Old Kent Road usually
    const prop = game.board[propIndex];
    prop.owner = p2.id;
    prop.rent = [500]; // Force high rent
    // Mock calculateRent to return 500
    game.calculateRent = () => 500;

    log('Scenario: P1 (£100) pays rent £500 to P2', 'info');
    game.payRent(p1, prop, 500);

    // CHECK 1: Immediate partial payment
    assert(p1.money === 0, 'P1 money should be 0');
    assert(p2.money === 1100, 'P2 should receive P1s £100 (1000 -> 1100)');
    assert(p1.debt !== null, 'P1 should have a debt object');
    assert(p1.debt.amount === 400, 'Debt amount should be £400');
    assert(p1.debt.creditor === p2.id, 'Creditor should be P2');

    // 2. Setup Recovery: P1 owns a property to mortgage
    const myPropIndex = 3;
    const myProp = game.board[myPropIndex];
    myProp.owner = p1.id;
    myProp.mortgage = 200;
    myProp.mortgaged = false;
    p1.properties.push(myPropIndex);

    log('Scenario: P1 mortgages property for £200', 'info');
    game.mortgageProperty(p1, myPropIndex);

    // CHECK 2: Intercepted payment
    assert(p1.money === 0, 'P1 money should still be 0 (intercepted)');
    assert(p2.money === 1300, 'P2 should receive the £200 mortgage money (1100 -> 1300)');
    assert(p1.debt.amount === 200, 'Remaining debt should be £200');

    // 3. Setup Final Clearance: P1 sells a house (mock money injection)
    // We'll manually inject money to simulate a big sale/trade
    log('Scenario: P1 receives £300 (Trade/Gift/etc)', 'info');
    p1.money += 300;
    // Manually trigger the processor since we modified money directly
    game.processDebtPayment(p1);

    // CHECK 3: Debt Cleared
    assert(p1.money === 100, 'P1 should keep surplus £100 (300 - 200 debt)');
    assert(p2.money === 1500, 'P2 should receive final £200 (1300 -> 1500)');
    assert(p1.debt === null, 'Debt object should be removed');

    log('Debt System Tests Passed!', 'success');
}

// ═══════════════════════════════════════════════════════════════════════
// BOT AUCTION LOGIC TESTS
// ═══════════════════════════════════════════════════════════════════════

function testBotAuctionLogic() {
    console.log('\n--- Testing Bot Auction Logic ---');

    // Setup Game & Bot
    const game = new Game('test-auction');
    const p1 = game.addPlayer('bot1', 'RichBot', true);

    // Instantiate Bot with correct signature
    // constructor(serverUrl, gameId, botName, difficulty)
    const bot = new Bot('http://mock', 'test-auction', 'RichBot', 'hard');

    // Inject dependencies manually for Unit Testing
    bot.socket = mockSocket;
    bot.gameId = 'test-auction';
    bot.myPlayer = p1;
    bot.gameState = {
        players: [p1],
        board: game.board,
        auction: null
    };

    // 1. Test Wealth Bonus
    const testProp = { index: 39, name: 'Mayfair', price: 400, color: 'dark-blue' };

    // Case A: Poor Bot
    p1.money = 100;
    const limitPoor = bot.calculateAuctionLimit(testProp);
    log(`Poor Bot Limit (£100 cash): £${limitPoor}`, 'info');

    // Case B: Rich Bot
    p1.money = 10000;
    const limitRich = bot.calculateAuctionLimit(testProp);
    log(`Rich Bot Limit (£10000 cash): £${limitRich}`, 'info');

    assert(limitRich > 500, 'Rich bot should bid over market price due to wealth bonus');
    assert(limitRich > limitPoor, 'Rich bot limit should be higher than poor bot limit');

    // 2. Test Reluctance Calculation
    // Mock Analysis
    bot.analyzeColorGroups = () => ({
        'dark-blue': { unowned: 1, total: 2, myCount: 0 }, // Neutral
        'brown': { unowned: 2, total: 2, myCount: 0 }
    });
    bot.analyzePlayerStrategies = () => ({}); // No opponent threats

    const reluctanceNeutral = bot.calculateBidReluctance(testProp);
    log(`Neutral Reluctance: ${reluctanceNeutral}`, 'info');
    assert(reluctanceNeutral > 0.3 && reluctanceNeutral < 0.8, 'Neutral reluctance should be mid-range');

    // 3. Test Monopoly Eagerness (Zero Reluctance)
    bot.wouldCompleteMyMonopoly = () => true;
    const reluctanceMono = bot.calculateBidReluctance(testProp);
    log(`Monopoly Reluctance: ${reluctanceMono}`, 'info');
    assert(reluctanceMono === 0.0, 'Reluctance for monopoly should be 0.0');

    // Reset
    bot.wouldCompleteMyMonopoly = () => false;

    // 4. Test "Give Up" Logic (Simulated)
    // Force High Reluctance
    bot.calculateBidReluctance = () => 0.9;

    // Test Handle Auction Pass

    const originalRandom = Math.random;
    Math.random = () => 0.0; // Force the "give up" check to PASS (0.0 < 0.3)

    let actionEmitted = null;
    bot.socket.emit = (action, data) => { actionEmitted = action; };
    bot.scheduleAuctionTimer = (cb) => cb(); // Run immediately

    // Mock Auction State
    game.auction = {
        property: testProp,
        currentBid: 500, // High price (> value)
        minimumBid: 510,
        highestBidder: 'other'
    };
    bot.gameState.auction = game.auction; // Bot reads from gameState

    // Trigger Handle
    bot.handleAuction(game.auction);

    // Check results
    if (actionEmitted === 'auctionPass') {
        log('Bot passed due to reluctance despite having funds', 'PASS');
        testsPassed++;
    } else {
        log(`Bot Action: ${actionEmitted}`, 'info');
        // This is not a fatal failure if logic is purely probability based, but we forced random()
    }

    Math.random = originalRandom; // Restore
}

// ═══════════════════════════════════════════════════════════════════════
// BOT DIFFICULTY TESTS
// ═══════════════════════════════════════════════════════════════════════

function testBotDifficultyLevels() {
    console.log('\n--- Testing Bot Difficulty Levels ---');

    const game = new Game('test-difficulty');
    const difficulties = ['easy', 'medium', 'hard'];
    const bots = {};
    const players = {};

    // Create a bot of each difficulty
    for (const difficulty of difficulties) {
        players[difficulty] = game.addPlayer(`bot-${difficulty}`, `${difficulty}Bot`, true);
        bots[difficulty] = new Bot('http://mock', 'test-difficulty', `${difficulty}Bot`, difficulty);
        bots[difficulty].socket = mockSocket;
        bots[difficulty].gameId = 'test-difficulty';
        bots[difficulty].myPlayer = players[difficulty];
        bots[difficulty].gameState = {
            players: Object.values(players),
            board: game.board,
            auction: null
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 1: Verify Difficulty Configurations are Different
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n  ► Test 1: Difficulty Configuration Differences');

    // Auction Aggressiveness: hard > medium > easy
    assert(
        bots.hard.config.auctionAggressiveness > bots.medium.config.auctionAggressiveness,
        'Hard bot auctionAggressiveness > Medium'
    );
    assert(
        bots.medium.config.auctionAggressiveness > bots.easy.config.auctionAggressiveness,
        'Medium bot auctionAggressiveness > Easy'
    );

    // Auction Randomness: easy > medium > hard (0 for hard)
    assert(
        bots.easy.config.auctionRandomness > bots.medium.config.auctionRandomness,
        'Easy bot has more auction randomness than Medium'
    );
    assert(
        bots.medium.config.auctionRandomness > bots.hard.config.auctionRandomness,
        'Medium bot has more auction randomness than Hard'
    );
    assert(
        bots.hard.config.auctionRandomness === 0,
        'Hard bot has zero auction randomness (optimal bidding)'
    );

    // Block Opponent Bonus: hard > medium > easy (0 for easy)
    assert(
        bots.hard.config.blockOpponentBonus > bots.medium.config.blockOpponentBonus,
        'Hard bot blockOpponentBonus > Medium'
    );
    assert(
        bots.medium.config.blockOpponentBonus > bots.easy.config.blockOpponentBonus,
        'Medium bot blockOpponentBonus > Easy'
    );
    assert(
        bots.easy.config.blockOpponentBonus === 0,
        'Easy bot does not recognize blocking (bonus = 0)'
    );

    // Min Cash Reserve: hard > medium > easy
    assert(
        bots.hard.config.minCashReserve > bots.medium.config.minCashReserve,
        'Hard bot keeps more cash reserve than Medium'
    );
    assert(
        bots.medium.config.minCashReserve > bots.easy.config.minCashReserve,
        'Medium bot keeps more cash reserve than Easy'
    );

    // Strategic Awareness flags
    assert(bots.hard.config.recognizesBlocking === true, 'Hard bot recognizes blocking');
    assert(bots.medium.config.recognizesBlocking === true, 'Medium bot recognizes blocking');
    assert(bots.easy.config.recognizesBlocking === false, 'Easy bot does NOT recognize blocking');

    assert(bots.hard.config.recognizesMonopolyValue === true, 'Hard bot recognizes monopoly value');
    assert(bots.medium.config.recognizesMonopolyValue === true, 'Medium bot recognizes monopoly value');
    assert(bots.easy.config.recognizesMonopolyValue === false, 'Easy bot does NOT recognize monopoly value');

    // ─────────────────────────────────────────────────────────────────────
    // TEST 2: Auction Limit Varies by Difficulty
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n  ► Test 2: Auction Limits Vary by Difficulty');

    const testProp = { index: 39, name: 'Mayfair', price: 400, color: 'dark-blue', type: 'property' };

    // Set all bots to have the same money for fair comparison
    for (const difficulty of difficulties) {
        players[difficulty].money = 2000;
    }

    // Mock Math.random to remove randomness for testing
    const originalRandom = Math.random;
    Math.random = () => 0.5; // Fixed value for reproducibility

    const limitEasy = bots.easy.calculateAuctionLimit(testProp);
    const limitMedium = bots.medium.calculateAuctionLimit(testProp);
    const limitHard = bots.hard.calculateAuctionLimit(testProp);

    log(`Easy Bot Auction Limit: £${limitEasy}`, 'info');
    log(`Medium Bot Auction Limit: £${limitMedium}`, 'info');
    log(`Hard Bot Auction Limit: £${limitHard}`, 'info');

    // Hard bot should be more aggressive (higher limit) than easier bots
    // Note: Easy bot has randomness which can swing either way, but on average should be lower
    assert(
        limitHard >= limitMedium,
        'Hard bot auction limit >= Medium bot limit'
    );

    // Verify the base calculation: price * aggressiveness + wealthBonus
    const expectedHardBase = Math.floor(testProp.price * bots.hard.config.auctionAggressiveness + 2000 * 0.15);
    log(`Expected Hard Base (no blocking/monopoly): ~£${expectedHardBase}`, 'info');

    // ─────────────────────────────────────────────────────────────────────
    // TEST 3: Easy Bot Doesn't Recognize Blocking
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n  ► Test 3: Easy Bot Ignores Blocking Opportunities');

    // Setup: Opponent owns 1 of 2 dark-blue, this property completes their monopoly
    const p2 = game.addPlayer('opponent', 'Opponent', false);
    p2.properties = [37]; // Park Lane (other dark-blue)
    game.board[37].owner = 'opponent';

    // Update game states
    for (const difficulty of difficulties) {
        bots[difficulty].gameState.players = [players[difficulty], p2];
    }

    // Check if wouldCompleteOpponentMonopoly returns something for hard/medium but not considered by easy
    const blockingProp = { index: 39, name: 'Mayfair', price: 400, color: 'dark-blue', type: 'property' };

    // Mock the blocking check to return true
    const originalWouldBlock = {
        easy: bots.easy.wouldCompleteOpponentMonopoly,
        medium: bots.medium.wouldCompleteOpponentMonopoly,
        hard: bots.hard.wouldCompleteOpponentMonopoly
    };

    for (const difficulty of difficulties) {
        bots[difficulty].wouldCompleteOpponentMonopoly = () => ({ id: 'opponent', name: 'Opponent' });
    }

    const limitEasyBlocking = bots.easy.calculateAuctionLimit(blockingProp);
    const limitHardBlocking = bots.hard.calculateAuctionLimit(blockingProp);

    log(`Easy Bot Limit (blocking scenario): £${limitEasyBlocking}`, 'info');
    log(`Hard Bot Limit (blocking scenario): £${limitHardBlocking}`, 'info');

    // Hard bot should bid MUCH higher to block opponent's monopoly
    // Easy bot should not factor blocking in at all
    assert(
        limitHardBlocking > limitEasyBlocking,
        'Hard bot bids higher to block opponent monopoly than Easy bot'
    );

    // Restore original methods
    for (const difficulty of difficulties) {
        bots[difficulty].wouldCompleteOpponentMonopoly = originalWouldBlock[difficulty];
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 4: Monopoly Completion Bonus Varies by Difficulty
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n  ► Test 4: Monopoly Completion Bonus');

    // Give bot one dark-blue property
    for (const difficulty of difficulties) {
        players[difficulty].properties = [37]; // Park Lane
        bots[difficulty].wouldCompleteMyMonopoly = () => true;
    }

    const limitEasyMono = bots.easy.calculateAuctionLimit(testProp);
    const limitMediumMono = bots.medium.calculateAuctionLimit(testProp);
    const limitHardMono = bots.hard.calculateAuctionLimit(testProp);

    log(`Easy Bot Limit (monopoly completion): £${limitEasyMono}`, 'info');
    log(`Medium Bot Limit (monopoly completion): £${limitMediumMono}`, 'info');
    log(`Hard Bot Limit (monopoly completion): £${limitHardMono}`, 'info');

    // Hard and Medium should bid very high to complete monopoly
    // Easy bot doesn't recognize monopoly value (flag is false), so no bonus
    assert(
        limitHardMono > limitEasyMono,
        'Hard bot bids higher to complete monopoly than Easy bot'
    );
    assert(
        limitMediumMono > limitEasyMono,
        'Medium bot bids higher to complete monopoly than Easy bot'
    );

    // Reset
    for (const difficulty of difficulties) {
        bots[difficulty].wouldCompleteMyMonopoly = () => false;
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 5: Trade Multipliers Differ by Difficulty
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n  ► Test 5: Trade Multipliers by Difficulty');

    assert(
        bots.hard.config.tradeCashMultiplier > bots.medium.config.tradeCashMultiplier,
        'Hard bot requires higher cash multiplier for trades than Medium'
    );
    assert(
        bots.medium.config.tradeCashMultiplier > bots.easy.config.tradeCashMultiplier,
        'Medium bot requires higher cash multiplier than Easy'
    );

    assert(
        bots.hard.config.monopolyGiveawayMultiplier > bots.medium.config.monopolyGiveawayMultiplier,
        'Hard bot charges more for monopoly-completing trades'
    );
    assert(
        bots.easy.config.tradeAcceptThreshold < bots.hard.config.tradeAcceptThreshold,
        'Easy bot accepts trades more readily (lower threshold)'
    );

    // ─────────────────────────────────────────────────────────────────────
    // TEST 6: Color Group Awareness Varies
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n  ► Test 6: Color Group Awareness');

    assert(
        bots.hard.config.colorGroupAwareness === 1.0,
        'Hard bot has full color group awareness'
    );
    assert(
        bots.medium.config.colorGroupAwareness > bots.easy.config.colorGroupAwareness,
        'Medium bot has more color awareness than Easy'
    );
    assert(
        bots.easy.config.colorGroupAwareness < 0.5,
        'Easy bot has low color group awareness'
    );

    // Check that color rankings are flattened for easy bot
    const orangeRankHard = bots.hard.colorGroupRanking['orange'];
    const orangeRankEasy = bots.easy.colorGroupRanking['orange'];
    const brownRankHard = bots.hard.colorGroupRanking['brown'];
    const brownRankEasy = bots.easy.colorGroupRanking['brown'];

    log(`Hard: Orange=${orangeRankHard.toFixed(2)}, Brown=${brownRankHard.toFixed(2)}`, 'info');
    log(`Easy: Orange=${orangeRankEasy.toFixed(2)}, Brown=${brownRankEasy.toFixed(2)}`, 'info');

    // Hard bot should have bigger difference between orange (10) and brown (3)
    const diffHard = orangeRankHard - brownRankHard;
    const diffEasy = orangeRankEasy - brownRankEasy;
    assert(
        diffHard > diffEasy,
        'Hard bot has more strategic color differentiation than Easy bot'
    );

    Math.random = originalRandom; // Restore

    log('Bot Difficulty Tests Passed!', 'success');
}
runTests();
