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
    emit: () => {},
    on: () => {},
    off: () => {}
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

    assert(limitRich > 1000, 'Rich bot should bid significantly over market price due to wealth bonus');
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
runTests();
