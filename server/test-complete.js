/**
 * Comprehensive Monopoly Game Test Suite
 * Tests ALL game mechanics, bot behavior, and edge cases
 * Run with: node server/test-complete.js
 */

const io = require('socket.io-client');
const { Game } = require('./game');
const GameManager = require('./gameManager');
const Bot = require('./bot');
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:3001';

// Test tracking
let testsPassed = 0;
let testsFailed = 0;
let testsSkipped = 0;
const testResults = [];

// Utility functions
function log(msg, type = 'info') {
    const prefix = {
        info: '  ℹ️ ',
        success: '  ✅',
        error: '  ❌',
        warn: '  ⚠️ ',
        test: '\n🧪'
    }[type] || '  ';
    console.log(`${prefix} ${msg}`);
}

function pass(testName, details = '') {
    testsPassed++;
    testResults.push({ name: testName, status: 'passed', details });
    console.log(`  ✅ PASS: ${testName}${details ? ` (${details})` : ''}`);
}

function fail(testName, reason) {
    testsFailed++;
    testResults.push({ name: testName, status: 'failed', reason });
    console.log(`  ❌ FAIL: ${testName} - ${reason}`);
}

function skip(testName, reason) {
    testsSkipped++;
    testResults.push({ name: testName, status: 'skipped', reason });
    console.log(`  ⏭️  SKIP: ${testName} - ${reason}`);
}

function assert(condition, testName, failReason) {
    if (condition) {
        pass(testName);
        return true;
    } else {
        fail(testName, failReason);
        return false;
    }
}

function createTestGame(options = {}) {
    const game = new Game(
        options.id || 'TEST-' + Date.now(),
        options.name || 'Test Game',
        options.maxPlayers || 4,
        options.isPrivate || false,
        options.auctionsEnabled || false
    );
    return game;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIT TESTS - Game Logic
// ═══════════════════════════════════════════════════════════════════════════

async function testGameCreation() {
    log('Game Creation', 'test');

    const game = createTestGame({ name: 'My Test Game', maxPlayers: 6 });

    assert(game.id !== undefined, 'Game has an ID');
    assert(game.name === 'My Test Game', 'Game name is set', `Expected "My Test Game", got "${game.name}"`);
    assert(game.maxPlayers === 6, 'Max players is set', `Expected 6, got ${game.maxPlayers}`);
    assert(game.started === false, 'Game is not started initially');
    assert(game.players.length === 0, 'No players initially');
    assert(game.board.length === 40, 'Board has 40 spaces', `Expected 40, got ${game.board.length}`);
    assert(game.housesAvailable === 32, 'Houses available is 32');
    assert(game.hotelsAvailable === 12, 'Hotels available is 12');
}

async function testPlayerManagement() {
    log('Player Management', 'test');

    const game = createTestGame({ maxPlayers: 2 });

    // Add first player
    const player1 = game.addPlayer('socket1', 'Alice');
    assert(player1 !== null, 'First player added successfully');
    assert(player1.name === 'Alice', 'Player name is correct');
    assert(player1.money === 1500, 'Player starts with £1500', `Got ${player1.money}`);
    assert(player1.position === 0, 'Player starts at position 0');
    assert(player1.isHost === true, 'First player is host');
    assert(player1.properties.length === 0, 'Player has no properties');

    // Add second player
    const player2 = game.addPlayer('socket2', 'Bob');
    assert(player2 !== null, 'Second player added successfully');
    assert(player2.isHost === false, 'Second player is not host');

    // Try to add third player (should fail)
    const player3 = game.addPlayer('socket3', 'Charlie');
    assert(player3 === null, 'Cannot add player beyond max');

    // Remove player before game starts
    game.removePlayer('socket1');
    assert(game.players.length === 1, 'Player removed before game start');
    assert(game.players[0].isHost === true, 'Remaining player becomes host');
}

async function testGameStart() {
    log('Game Start', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Player 1');
    game.addPlayer('p2', 'Player 2');

    game.start();

    assert(game.started === true, 'Game is marked as started');
    assert(game.currentPlayerIndex >= 0, 'Current player index is valid');
    assert(game.turnStartTime !== undefined, 'Turn start time is set');
    assert(game.gameLog.length > 0, 'Game log has entries');
}

async function testDiceRolling() {
    log('Dice Rolling', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Player 1');
    game.addPlayer('p2', 'Player 2');
    game.start();

    // Test multiple rolls to ensure randomness and validity
    let rollsValid = true;

    for (let i = 0; i < 10; i++) {
        game.diceRolled = false;
        game.canRollAgain = false;
        game.players[game.currentPlayerIndex].inJail = false;

        const result = game.rollDice();

        if (result.die1 < 1 || result.die1 > 6 || result.die2 < 1 || result.die2 > 6) {
            rollsValid = false;
        }
        if (result.total !== result.die1 + result.die2) {
            rollsValid = false;
        }

        // Reset for next roll
        game.players[game.currentPlayerIndex].position = 0;
        game.players[game.currentPlayerIndex].inJail = false;
    }

    assert(rollsValid, 'All dice rolls are valid (1-6)');

    // Test that diceRolled flag is properly set
    const game2 = createTestGame();
    game2.addPlayer('p1', 'Test');
    game2.start();

    assert(game2.diceRolled === false, 'diceRolled starts as false');
    game2.rollDice();
    assert(game2.diceRolled === true, 'diceRolled flag is set after rolling');
}

async function testPlayerMovement() {
    log('Player Movement', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Player 1');
    game.start();

    const player = game.players[0];

    // Simple movement
    game.movePlayer(player, 5);
    assert(player.position === 5, 'Player moves forward correctly', `Expected 5, got ${player.position}`);

    // Movement wrapping around board
    player.position = 38;
    const initialMoney = player.money;
    game.movePlayer(player, 5);
    assert(player.position === 3, 'Player wraps around board', `Expected 3, got ${player.position}`);
    assert(player.money === initialMoney + 200, 'Player collects £200 for passing GO');

    // Direct movement
    player.position = 5;
    game.movePlayerTo(player, 0, true);
    assert(player.position === 0, 'movePlayerTo works correctly');
}

async function testPropertyPurchase() {
    log('Property Purchase', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Player 1');
    game.start();

    const player = game.players[0];
    player.position = 1; // Old Kent Road

    // Set up pending action
    game.pendingAction = { type: 'buyOrAuction', property: game.board[1] };

    const initialMoney = player.money;
    const propertyPrice = game.board[1].price;

    const result = game.buyProperty();

    assert(result.success === true, 'Property purchase succeeds');
    assert(game.board[1].owner === player.id, 'Property owner is set');
    assert(player.properties.includes(1), 'Property added to player');
    assert(player.money === initialMoney - propertyPrice, 'Money deducted correctly');
    assert(game.pendingAction === null, 'Pending action cleared');

    // Test buying when can't afford
    player.money = 10;
    player.position = 3; // Whitechapel
    game.pendingAction = { type: 'buyOrAuction', property: game.board[3] };

    const result2 = game.buyProperty();
    assert(result2.success === false, 'Cannot buy without enough money');
}

async function testRentCalculation() {
    log('Rent Calculation', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Player 1');
    game.addPlayer('p2', 'Player 2');
    game.start();

    const owner = game.players[0];
    const renter = game.players[1];

    // Buy a property
    game.board[1].owner = owner.id;
    owner.properties.push(1);

    // Basic rent
    game.lastDiceRoll = { die1: 3, die2: 4, total: 7 };
    const basicRent = game.calculateRent(game.board[1], renter);
    assert(basicRent === game.board[1].rent[0], 'Basic rent is correct', `Expected ${game.board[1].rent[0]}, got ${basicRent}`);

    // Monopoly rent (double)
    game.board[3].owner = owner.id; // Both brown properties
    owner.properties.push(3);
    const monopolyRent = game.calculateRent(game.board[1], renter);
    assert(monopolyRent === game.board[1].rent[0] * 2, 'Monopoly doubles base rent');

    // Railroad rent
    game.board[5].owner = owner.id;
    owner.properties.push(5);
    const railRent1 = game.calculateRent(game.board[5], renter);
    assert(railRent1 === 25, 'One railroad = £25');

    game.board[15].owner = owner.id;
    owner.properties.push(15);
    const railRent2 = game.calculateRent(game.board[5], renter);
    assert(railRent2 === 50, 'Two railroads = £50');

    // Utility rent
    game.board[12].owner = owner.id;
    owner.properties.push(12);
    const utilRent1 = game.calculateRent(game.board[12], renter);
    assert(utilRent1 === game.lastDiceRoll.total * 4, 'One utility = 4x dice');

    game.board[28].owner = owner.id;
    owner.properties.push(28);
    const utilRent2 = game.calculateRent(game.board[12], renter);
    assert(utilRent2 === game.lastDiceRoll.total * 10, 'Two utilities = 10x dice');
}

async function testRentPayment() {
    log('Rent Payment', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Owner');
    game.addPlayer('p2', 'Renter');
    game.start();

    const owner = game.players[0];
    const renter = game.players[1];

    game.board[1].owner = owner.id;
    owner.properties.push(1);

    const ownerInitial = owner.money;
    const renterInitial = renter.money;
    const rent = 50;

    game.payRent(renter, game.board[1], rent);

    assert(owner.money === ownerInitial + rent, 'Owner receives rent');
    assert(renter.money === renterInitial - rent, 'Renter pays rent');
}

async function testHouseBuilding() {
    log('House Building', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Builder');
    game.start();

    const player = game.players[0];

    // Give player both brown properties
    game.board[1].owner = player.id;
    game.board[3].owner = player.id;
    player.properties = [1, 3];

    // Build a house
    const initialMoney = player.money;
    const houseCost = game.board[1].houseCost;
    const initialHouses = game.housesAvailable;

    const result = game.buildHouse(player, 1);

    assert(result.success === true, 'House build succeeds');
    assert(game.board[1].houses === 1, 'Property has 1 house');
    assert(player.money === initialMoney - houseCost, 'House cost deducted');
    assert(game.housesAvailable === initialHouses - 1, 'House supply decreased');

    // Test even building rule
    const result2 = game.buildHouse(player, 1);
    assert(result2.success === false, 'Must build evenly');

    // Build on other property
    const result3 = game.buildHouse(player, 3);
    assert(result3.success === true, 'Can build on other property');

    // Test without monopoly
    const game2 = createTestGame();
    game2.addPlayer('p1', 'Builder');
    game2.start();
    game2.board[1].owner = game2.players[0].id;
    game2.players[0].properties = [1];

    const result4 = game2.buildHouse(game2.players[0], 1);
    assert(result4.success === false, 'Cannot build without monopoly');
}

async function testHotelBuilding() {
    log('Hotel Building', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Builder');
    game.start();

    const player = game.players[0];
    player.money = 10000; // Give plenty of money

    game.board[1].owner = player.id;
    game.board[3].owner = player.id;
    player.properties = [1, 3];

    // Build 4 houses on each
    for (let i = 0; i < 4; i++) {
        game.buildHouse(player, 1);
        game.buildHouse(player, 3);
    }

    assert(game.board[1].houses === 4, 'Has 4 houses before hotel');

    const housesBeforeHotel = game.housesAvailable;
    const hotelsBeforeHotel = game.hotelsAvailable;

    const result = game.buildHouse(player, 1); // This builds a hotel

    assert(result.success === true, 'Hotel build succeeds');
    assert(game.board[1].houses === 5, 'Houses = 5 indicates hotel');
    assert(game.housesAvailable === housesBeforeHotel + 4, '4 houses returned to supply');
    assert(game.hotelsAvailable === hotelsBeforeHotel - 1, 'Hotel taken from supply');
}

async function testHouseSelling() {
    log('House Selling', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Seller');
    game.start();

    const player = game.players[0];
    game.board[1].owner = player.id;
    game.board[3].owner = player.id;
    player.properties = [1, 3];
    game.board[1].houses = 2;
    game.board[3].houses = 2;

    const initialMoney = player.money;
    const houseCost = game.board[1].houseCost;

    const result = game.sellHouse(player, 1);

    assert(result.success === true, 'House sell succeeds');
    assert(game.board[1].houses === 1, 'House count decreased');
    assert(player.money === initialMoney + houseCost / 2, 'Received half value');

    // Test even selling rule
    const result2 = game.sellHouse(player, 1);
    assert(result2.success === false, 'Must sell evenly');
}

async function testMortgaging() {
    log('Mortgaging', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Owner');
    game.start();

    const player = game.players[0];
    game.board[1].owner = player.id;
    player.properties = [1];

    const initialMoney = player.money;
    const mortgageValue = game.board[1].mortgage;

    // Mortgage
    const result = game.mortgageProperty(player, 1);

    assert(result.success === true, 'Mortgage succeeds');
    assert(game.board[1].mortgaged === true, 'Property is mortgaged');
    assert(player.money === initialMoney + mortgageValue, 'Received mortgage value');

    // Cannot mortgage again
    const result2 = game.mortgageProperty(player, 1);
    assert(result2.success === false, 'Cannot re-mortgage');

    // Unmortgage
    const unmortgageCost = Math.floor(mortgageValue * 1.1);
    const moneyBefore = player.money;

    const result3 = game.unmortgageProperty(player, 1);

    assert(result3.success === true, 'Unmortgage succeeds');
    assert(game.board[1].mortgaged === false, 'Property is unmortgaged');
    assert(player.money === moneyBefore - unmortgageCost, 'Paid unmortgage cost (10% interest)');
}

async function testJailMechanics() {
    log('Jail Mechanics', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Prisoner');
    game.start();

    const player = game.players[0];

    // Send to jail
    game.sendToJail(player);

    assert(player.inJail === true, 'Player is in jail');
    assert(player.position === 10, 'Player is at jail position');
    assert(player.jailTurns === 0, 'Jail turns reset');
    assert(game.canRollAgain === false, 'Cannot roll again after going to jail');

    // Pay jail fine
    const initialMoney = player.money;
    const result = game.payJailFine(player);

    assert(result.success === true, 'Jail fine payment succeeds');
    assert(player.inJail === false, 'Player released from jail');
    assert(player.money === initialMoney - 50, '£50 fine paid');
    assert(game.diceRolled === false, 'Can roll dice after paying fine');

    // Use jail card
    game.sendToJail(player);
    player.getOutOfJailCards = 1;

    const result2 = game.useJailCard(player);

    assert(result2.success === true, 'Jail card use succeeds');
    assert(player.inJail === false, 'Player released');
    assert(player.getOutOfJailCards === 0, 'Card used up');
}

async function testAuctions() {
    log('Auctions', 'test');

    const game = createTestGame({ auctionsEnabled: true });
    game.addPlayer('p1', 'Bidder 1');
    game.addPlayer('p2', 'Bidder 2');
    game.addPlayer('p3', 'Bidder 3'); // Add third player to prevent auto-complete on first bid
    game.start();

    // Set up auction
    game.pendingAction = { type: 'buyOrAuction', property: game.board[1] };
    game.startAuction();

    assert(game.auction !== null, 'Auction started');
    assert(game.auction.minimumBid === 10, 'Minimum bid is £10');
    assert(game.pendingAction === null, 'Pending action cleared');

    // Place bids
    const player2 = game.players[1];
    const player3 = game.players[2];

    // Bid below minimum should fail
    const result1 = game.placeBid(player2, 5);
    assert(result1.success === false, 'Bid below minimum rejected');

    // Valid bid - now with 3 players and only 1 passed, auction won't auto-complete
    const result2 = game.placeBid(player2, 15);
    assert(result2.success === true, 'Valid bid accepted');
    assert(game.auction !== null && game.auction.currentBid === 15, 'Current bid updated');
    assert(game.auction !== null && game.auction.highestBidder === player2.id, 'Highest bidder set');

    // Player 3 passes, leaving only player 2 (highest bidder) - this will auto-complete
    game.passBid(player3);

    assert(game.auction === null, 'Auction completed');
    assert(game.board[1].owner === player2.id, 'Winner owns property');
}

async function testTrades() {
    log('Trades', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Trader 1');
    game.addPlayer('p2', 'Trader 2');
    game.start();

    const player1 = game.players[0];
    const player2 = game.players[1];

    // Give properties
    game.board[1].owner = player1.id;
    player1.properties = [1];
    game.board[3].owner = player2.id;
    player2.properties = [3];

    // Propose trade
    const offer = { money: 50, properties: [1] };
    const request = { money: 0, properties: [3] };

    const trade = game.proposeTrade(player1, player2.id, offer, request);

    assert(trade !== null, 'Trade proposed');
    assert(trade.status === 'pending', 'Trade is pending');
    assert(game.trades.length === 1, 'Trade added to list');

    // Accept trade
    const p1MoneyBefore = player1.money;
    const p2MoneyBefore = player2.money;

    const result = game.acceptTrade(trade.id, player2);

    assert(result.success === true, 'Trade accepted');
    assert(player1.money === p1MoneyBefore - 50, 'Money transferred from trader 1');
    assert(player2.money === p2MoneyBefore + 50, 'Money transferred to trader 2');
    assert(game.board[1].owner === player2.id, 'Property 1 transferred');
    assert(game.board[3].owner === player1.id, 'Property 3 transferred');

    // Test decline
    const trade2 = game.proposeTrade(player1, player2.id, { money: 100 }, { money: 50 });
    game.declineTrade(trade2.id);

    assert(trade2.status === 'declined', 'Trade declined');
}

async function testBankruptcy() {
    log('Bankruptcy', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Bankrupt Player');
    game.addPlayer('p2', 'Other Player');
    game.start();

    const player = game.players[0];
    game.board[1].owner = player.id;
    player.properties = [1];
    player.money = -500;

    const result = game.declareBankruptcy(player);

    assert(player.bankrupt === true, 'Player is bankrupt');
    assert(player.money === 0, 'Money reset to 0');
    assert(player.properties.length === 0, 'Properties cleared');
    assert(game.board[1].owner === null, 'Property returned to bank');
}

async function testWinCondition() {
    log('Win Condition', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Winner');
    game.addPlayer('p2', 'Loser');
    game.start();

    // One player bankrupt
    game.players[1].bankrupt = true;

    assert(game.checkWinner() === true, 'Winner detected when one player left');
    assert(game.getWinner().id === game.players[0].id, 'Correct winner returned');

    // No winner yet
    game.players[1].bankrupt = false;
    assert(game.checkWinner() === false, 'No winner when multiple players');
}

async function testChanceCards() {
    log('Chance Cards', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Card Drawer');
    game.start();

    const player = game.players[0];
    player.position = 7; // Chance space

    // Draw a few cards
    const cardsSeen = new Set();
    for (let i = 0; i < 5; i++) {
        const result = game.drawChanceCard(player);
        cardsSeen.add(result.card.text);
        // Reset player state
        player.inJail = false;
        player.position = 7;
        player.money = 1500;
    }

    assert(cardsSeen.size >= 1, 'Chance cards are drawn');
    assert(game.chanceIndex <= game.chanceCards.length, 'Chance index is valid');
}

async function testCommunityChestCards() {
    log('Community Chest Cards', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Card Drawer');
    game.start();

    const player = game.players[0];
    player.position = 2; // Community Chest space

    const cardsSeen = new Set();
    for (let i = 0; i < 5; i++) {
        const result = game.drawCommunityChestCard(player);
        cardsSeen.add(result.card.text);
        player.inJail = false;
        player.position = 2;
        player.money = 1500;
    }

    assert(cardsSeen.size >= 1, 'Community Chest cards are drawn');
}

async function testLandingOnSpaces() {
    log('Landing on Different Space Types', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Lander');
    game.addPlayer('p2', 'Owner');
    game.start();

    const player = game.players[0];
    const owner = game.players[1];
    game.lastDiceRoll = { die1: 3, die2: 4, total: 7 };
    game.diceRolled = true;

    // Test GO
    player.position = 0;
    const goResult = game.handleLanding();
    assert(goResult.type === 'landed', 'Landing on GO works');

    // Test Tax
    player.position = 4; // Income Tax
    const initialMoney = player.money;
    game.handleLanding();
    assert(player.money === initialMoney - 200, 'Tax paid correctly');

    // Test Free Parking
    game.freeParking = 500;
    player.position = 20;
    const fpMoney = player.money;
    game.handleLanding();
    assert(player.money === fpMoney + 500, 'Free Parking collected');
    assert(game.freeParking === 0, 'Free Parking reset');

    // Test Go To Jail
    player.position = 30;
    game.handleLanding();
    assert(player.inJail === true, 'Go to Jail sends to jail');
    assert(player.position === 10, 'Go to Jail moves to jail');
}

async function testEndTurn() {
    log('End Turn', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Player 1');
    game.addPlayer('p2', 'Player 2');
    game.start();

    const firstPlayer = game.currentPlayerIndex;
    game.diceRolled = true;

    game.endTurn();

    assert(game.diceRolled === false, 'Dice rolled reset');
    assert(game.canRollAgain === false, 'Can roll again reset');
    assert(game.pendingAction === null, 'Pending action cleared');
    assert(game.currentPlayerIndex !== firstPlayer || game.players.length === 1, 'Turn advanced');
}

async function testBotTimeout() {
    log('Bot Timeout Detection', 'test');

    const game = createTestGame();
    game.addPlayer('bot1', 'Test Bot');
    game.players[0].isBot = true;
    game.start();

    // Simulate a recent turn - no timeout
    game.turnStartTime = Date.now() - 5000;
    game.lastActionTime = Date.now() - 5000;
    let result = game.checkBotTimeout();
    assert(result === null, 'No timeout for recent turn');

    // Simulate old turn - should timeout
    game.turnStartTime = Date.now() - 35000;
    game.lastActionTime = Date.now() - 35000;
    result = game.checkBotTimeout();
    assert(result !== null && result.skipped === true, 'Bot timeout detected');
}

async function testGameState() {
    log('Game State Serialization', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Player 1');
    game.addPlayer('p2', 'Player 2');
    game.start();

    game.board[1].owner = game.players[0].id;
    game.players[0].properties = [1];

    const state = game.getState();

    assert(state.id === game.id, 'State includes game ID');
    assert(state.started === true, 'State includes started flag');
    assert(state.players.length === 2, 'State includes players');
    assert(state.board.length === 40, 'State includes board');
    assert(Array.isArray(state.gameLog), 'State includes game log');
    assert(state.players[0].properties.length === 1, 'Player properties included');
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIT TESTS - Game Manager
// ═══════════════════════════════════════════════════════════════════════════

async function testGameManager() {
    log('Game Manager', 'test');

    // Clean up any existing save file
    const savePath = path.join(__dirname, 'saved_games.json');
    if (fs.existsSync(savePath)) {
        fs.unlinkSync(savePath);
    }

    const gm = new GameManager();

    // Create game
    const game = gm.createGame('Test Game', 4, false, false);
    assert(game !== null, 'Game created via manager');
    assert(gm.getGameCount() === 1, 'Game count is 1');

    // Get game
    const retrieved = gm.getGame(game.id);
    assert(retrieved === game, 'Game can be retrieved');

    // Public games
    const publicGames = gm.getPublicGames();
    assert(publicGames.length === 1, 'Public games list works');

    // Remove game
    gm.removeGame(game.id);
    assert(gm.getGameCount() === 0, 'Game removed');

    // Clean up
    if (fs.existsSync(savePath)) {
        fs.unlinkSync(savePath);
    }
}

async function testGamePersistence() {
    log('Game Persistence', 'test');

    const savePath = path.join(__dirname, 'saved_games.json');

    // Clean up
    if (fs.existsSync(savePath)) {
        fs.unlinkSync(savePath);
    }

    const gm = new GameManager();
    const game = gm.createGame('Persistence Test', 2, false, false);
    game.addPlayer('p1', 'Test Player');
    game.start();
    game.players[0].money = 9999;

    gm.saveGames();

    if (fs.existsSync(savePath)) {
        pass('Games saved to disk');

        const data = JSON.parse(fs.readFileSync(savePath, 'utf8'));
        if (data.length > 0 && data[0].players?.[0]?.money === 9999) {
            pass('Game state preserved correctly');
        } else {
            fail('Game state preservation', 'State not preserved');
        }

        // Clean up
        fs.unlinkSync(savePath);
    } else {
        fail('Game save', 'File not created');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS - Socket.io Communication
// ═══════════════════════════════════════════════════════════════════════════

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

async function testSocketConnection() {
    log('Socket.io Connection (requires running server)', 'test');

    try {
        const socket = await connectPlayer('Test Player');
        pass('Can connect to server');
        socket.disconnect();
    } catch (err) {
        skip('Socket connection', 'Server not running');
        return false;
    }
    return true;
}

async function testSocketGameFlow() {
    log('Socket.io Game Flow (requires running server)', 'test');

    let player1, player2;

    try {
        player1 = await connectPlayer('Player1');
        player2 = await connectPlayer('Player2');
    } catch (err) {
        skip('Socket game flow', 'Server not running');
        return;
    }

    try {
        // Create game
        player1.emit('createGame', {
            playerName: 'Player1',
            gameName: 'Socket Test Game',
            maxPlayers: 2,
            isPrivate: false,
            auctionsEnabled: false
        });

        const { gameId } = await waitForEvent(player1, 'gameCreated');
        assert(gameId !== undefined, 'Game created via socket');

        // Join game
        player2.emit('joinGame', { gameId, playerName: 'Player2' });
        await waitForEvent(player2, 'gameJoined');
        pass('Player2 joined via socket');

        // Start game
        player1.emit('startGame', { gameId });
        const { game } = await waitForEvent(player1, 'gameStarted');
        assert(game.started === true, 'Game started via socket');

        // Roll dice
        player1.emit('rollDice', { gameId });
        const { result } = await waitForEvent(player1, 'diceRolled', 5000);
        assert(result.total >= 2 && result.total <= 12, 'Dice roll via socket works');

        // Leave game
        player1.emit('leaveGame', { gameId });
        player2.emit('leaveGame', { gameId });

    } catch (err) {
        fail('Socket game flow', err.message);
    } finally {
        player1?.disconnect();
        player2?.disconnect();
    }
}

async function testBotIntegration() {
    log('Bot Integration (requires running server)', 'test');

    let player1;

    try {
        player1 = await connectPlayer('Host');
    } catch (err) {
        skip('Bot integration', 'Server not running');
        return;
    }

    try {
        // Create game
        player1.emit('createGame', {
            playerName: 'Host',
            gameName: 'Bot Test Game',
            maxPlayers: 2,
            isPrivate: false,
            auctionsEnabled: false
        });

        const { gameId } = await waitForEvent(player1, 'gameCreated');

        // Add bot
        player1.emit('addBot', { gameId });

        // Wait for bot to join
        await waitForEvent(player1, 'playerJoined', 5000);
        pass('Bot added and joined game');

        // Start game
        player1.emit('startGame', { gameId });
        await waitForEvent(player1, 'gameStarted');
        pass('Game with bot started');

        // Wait a bit for bot actions
        await new Promise(r => setTimeout(r, 3000));

        player1.emit('leaveGame', { gameId });

    } catch (err) {
        fail('Bot integration', err.message);
    } finally {
        player1?.disconnect();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASE TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function testEdgeCases() {
    log('Edge Cases', 'test');

    const game = createTestGame();
    game.addPlayer('p1', 'Player');
    game.start();

    const player = game.players[0];

    // Test triple doubles sends to jail
    game.doublesCount = 2;
    game.canRollAgain = true;

    // Force a doubles roll
    const originalRandom = Math.random;
    Math.random = () => 0.1; // Will give die value of 1

    game.rollDice();

    Math.random = originalRandom;

    assert(player.inJail === true, 'Triple doubles sends to jail');
    assert(game.canRollAgain === false, 'Cannot roll again after going to jail');

    // Test mortgaged property gives no rent
    game.players[0].inJail = false;
    game.board[1].owner = player.id;
    game.board[1].mortgaged = true;

    const rent = game.calculateRent(game.board[1], player);
    assert(rent === 0, 'Mortgaged property gives no rent');

    // Test cannot build on mortgaged property
    game.board[1].mortgaged = true;
    game.board[3].owner = player.id;
    player.properties = [1, 3];

    const result = game.buildHouse(player, 1);
    assert(result.success === false, 'Cannot build on mortgaged property');

    // Test cannot mortgage property with houses
    game.board[1].mortgaged = false;
    game.board[1].houses = 2;
    game.board[3].houses = 2;

    const mortResult = game.mortgageProperty(player, 1);
    assert(mortResult.success === false, 'Cannot mortgage property with houses');
}

async function testColorConsistency() {
    log('Color Naming Consistency', 'test');

    const { BOARD_SPACES } = require('./boardData');

    const colorSpaces = BOARD_SPACES.filter(s => s.color);
    const colors = new Set(colorSpaces.map(s => s.color));

    const expectedColors = ['brown', 'light-blue', 'pink', 'orange', 'red', 'yellow', 'green', 'dark-blue'];

    for (const color of expectedColors) {
        assert(colors.has(color), `Color "${color}" exists in board`, `Missing color: ${color}`);
    }

    // Check no inconsistent colors
    for (const color of colors) {
        assert(expectedColors.includes(color), `Color "${color}" is valid`, `Unexpected color: ${color}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEBT SYSTEM TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function testDebtSystem() {
    log('Debt System', 'test');

    const game = createTestGame();
    const debtor = game.addPlayer('debtor', 'Debtor');
    const creditor = game.addPlayer('creditor', 'Creditor');
    game.start();

    // Setup: Debtor has £100, owes £500 rent
    debtor.money = 100;
    creditor.money = 1000;

    // Setup property for creditor
    game.board[1].owner = creditor.id;
    creditor.properties.push(1);

    // Pay rent that exceeds available funds
    game.payRent(debtor, game.board[1], 500);

    // Check partial payment occurred
    assert(debtor.money === 0, 'Debtor money should be 0 after partial payment');
    assert(creditor.money === 1100, 'Creditor receives partial payment (1000 + 100)');
    assert(debtor.debt !== null, 'Debtor should have debt object');
    assert(debtor.debt?.amount === 400, 'Debt amount should be remaining £400');
    assert(debtor.debt?.creditor === creditor.id, 'Debt creditor is correct');

    // Setup: Debtor owns a property to mortgage for debt repayment
    game.board[3].owner = debtor.id;
    game.board[3].mortgage = 200;
    game.board[3].mortgaged = false;
    debtor.properties = [3];

    // Mortgage the property - money should be intercepted for debt
    game.mortgageProperty(debtor, 3);

    // Check debt was reduced
    assert(debtor.money === 0, 'Debtor money still 0 (mortgage money intercepted for debt)');
    assert(creditor.money === 1300, 'Creditor receives mortgage money as debt payment (1100 + 200)');
    assert(debtor.debt?.amount === 200, 'Remaining debt should be £200');

    // Final clearance - inject money and process debt
    debtor.money = 300;
    game.processDebtPayment(debtor);

    assert(debtor.money === 100, 'Debtor keeps surplus after clearing debt (300 - 200)');
    assert(creditor.money === 1500, 'Creditor receives final debt payment (1300 + 200)');
    assert(debtor.debt === null, 'Debt object cleared after full repayment');
}

async function testDebtWithBankruptcy() {
    log('Debt with Bankruptcy', 'test');

    const game = createTestGame();
    const debtor = game.addPlayer('debtor', 'Poor Player');
    const creditor = game.addPlayer('creditor', 'Rich Player');
    game.start();

    // Setup: Debtor has nothing
    debtor.money = 50;
    creditor.money = 1000;

    game.board[1].owner = creditor.id;
    creditor.properties.push(1);

    // Pay rent that creates debt
    game.payRent(debtor, game.board[1], 100);

    assert(debtor.money === 0, 'Debtor paid all available money');
    assert(debtor.debt?.amount === 50, 'Debtor owes remaining £50');

    // Check bankruptcy with no assets
    game.checkBankruptcy(debtor);

    // Since debtor has no assets and pending action should be mustPayOrBankrupt
    assert(
        game.pendingAction?.type === 'mustRaiseFunds' || game.pendingAction?.type === 'mustPayOrBankrupt',
        'Pending action set for debt resolution'
    );

    // Declare bankruptcy
    game.declareBankruptcy(debtor);

    assert(debtor.bankrupt === true, 'Debtor is bankrupt');
    assert(debtor.debt === null, 'Debt cleared on bankruptcy');
    assert(debtor.money === 0, 'Money is 0 after bankruptcy');
}

// ═══════════════════════════════════════════════════════════════════════════
// BOT DIFFICULTY TESTS
// ═══════════════════════════════════════════════════════════════════════════

// Mock Socket for Bot tests
const mockSocket = {
    emit: () => { },
    on: () => { },
    off: () => { }
};

async function testBotDifficultyConfigurations() {
    log('Bot Difficulty Configurations', 'test');

    const game = createTestGame();
    const difficulties = ['easy', 'medium', 'hard'];
    const bots = {};
    const players = {};

    // Create a bot of each difficulty
    for (const difficulty of difficulties) {
        players[difficulty] = game.addPlayer(`bot-${difficulty}`, `${difficulty}Bot`, true);
        bots[difficulty] = new Bot('http://mock', game.id, `${difficulty}Bot`, difficulty);
        bots[difficulty].socket = mockSocket;
        bots[difficulty].myPlayer = players[difficulty];
        bots[difficulty].gameState = {
            players: Object.values(players),
            board: game.board,
            auction: null
        };
    }

    // Auction Aggressiveness: hard > medium > easy
    assert(
        bots.hard.config.auctionAggressiveness > bots.medium.config.auctionAggressiveness,
        'Hard bot more aggressive in auctions than Medium'
    );
    assert(
        bots.medium.config.auctionAggressiveness > bots.easy.config.auctionAggressiveness,
        'Medium bot more aggressive in auctions than Easy'
    );

    // Randomness: easy > medium > hard (hard = 0)
    assert(bots.hard.config.auctionRandomness === 0, 'Hard bot has no auction randomness');
    assert(
        bots.easy.config.auctionRandomness > bots.medium.config.auctionRandomness,
        'Easy bot has more randomness than Medium'
    );

    // Blocking recognition
    assert(bots.hard.config.recognizesBlocking === true, 'Hard bot recognizes blocking');
    assert(bots.medium.config.recognizesBlocking === true, 'Medium bot recognizes blocking');
    assert(bots.easy.config.recognizesBlocking === false, 'Easy bot does not recognize blocking');

    // Monopoly value recognition
    assert(bots.hard.config.recognizesMonopolyValue === true, 'Hard bot recognizes monopoly value');
    assert(bots.easy.config.recognizesMonopolyValue === false, 'Easy bot does not recognize monopoly value');

    // Cash reserves
    assert(
        bots.hard.config.minCashReserve > bots.easy.config.minCashReserve,
        'Hard bot keeps more cash reserve'
    );
}

async function testBotDifficultyAuctionBehavior() {
    log('Bot Difficulty Auction Behavior', 'test');

    const game = createTestGame();
    // Don't start the game - we only need the board for bot calculations

    const testProp = { index: 39, name: 'Mayfair', price: 400, color: 'dark-blue', type: 'property' };

    // Create bots with same money
    const easyBot = new Bot('http://mock', game.id, 'EasyBot', 'easy');
    const hardBot = new Bot('http://mock', game.id, 'HardBot', 'hard');

    const easyPlayer = { money: 2000, properties: [], id: 'easy-id' };
    const hardPlayer = { money: 2000, properties: [], id: 'hard-id' };

    easyBot.socket = mockSocket;
    hardBot.socket = mockSocket;
    easyBot.myPlayer = easyPlayer;
    hardBot.myPlayer = hardPlayer;
    easyBot.gameState = { players: [easyPlayer], board: game.board, auction: null };
    hardBot.gameState = { players: [hardPlayer], board: game.board, auction: null };

    // Mock random for consistent testing
    const originalRandom = Math.random;
    Math.random = () => 0.5;

    const easyLimit = easyBot.calculateAuctionLimit(testProp);
    const hardLimit = hardBot.calculateAuctionLimit(testProp);

    Math.random = originalRandom;

    assert(
        hardLimit >= easyLimit,
        'Hard bot has higher auction limit than Easy',
        `Hard: £${hardLimit}, Easy: £${easyLimit}`
    );
}

async function testBotDifficultyBlockingBehavior() {
    log('Bot Difficulty Blocking Behavior', 'test');

    const game = createTestGame();
    const opponent = game.addPlayer('opponent', 'Opponent');
    game.addPlayer('dummy', 'Dummy'); // Need at least 2 players to start
    game.start();

    // Setup: Opponent owns Park Lane (37), we're testing if bot will pay more for Mayfair to block
    game.board[37].owner = opponent.id;
    opponent.properties = [37];

    const blockingProp = { index: 39, name: 'Mayfair', price: 400, color: 'dark-blue', type: 'property' };

    const easyBot = new Bot('http://mock', game.id, 'EasyBot', 'easy');
    const hardBot = new Bot('http://mock', game.id, 'HardBot', 'hard');

    const easyPlayer = { money: 2000, properties: [], id: 'easy-id' };
    const hardPlayer = { money: 2000, properties: [], id: 'hard-id' };

    easyBot.socket = mockSocket;
    hardBot.socket = mockSocket;
    easyBot.myPlayer = easyPlayer;
    hardBot.myPlayer = hardPlayer;
    easyBot.gameState = { players: [easyPlayer, opponent], board: game.board, auction: null };
    hardBot.gameState = { players: [hardPlayer, opponent], board: game.board, auction: null };

    // Mock the blocking check
    easyBot.wouldCompleteOpponentMonopoly = () => ({ id: 'opponent', name: 'Opponent' });
    hardBot.wouldCompleteOpponentMonopoly = () => ({ id: 'opponent', name: 'Opponent' });

    const originalRandom = Math.random;
    Math.random = () => 0.5;

    const easyLimit = easyBot.calculateAuctionLimit(blockingProp);
    const hardLimit = hardBot.calculateAuctionLimit(blockingProp);

    Math.random = originalRandom;

    // Hard bot should bid much higher to block (because recognizesBlocking = true)
    assert(
        hardLimit > easyLimit,
        'Hard bot bids higher to block opponent monopoly',
        `Hard: £${hardLimit}, Easy: £${easyLimit}`
    );
}

async function testBotDifficultyColorGroupAwareness() {
    log('Bot Difficulty Color Group Awareness', 'test');

    const easyBot = new Bot('http://mock', 'test', 'EasyBot', 'easy');
    const hardBot = new Bot('http://mock', 'test', 'HardBot', 'hard');

    // Hard bot should have full color awareness (1.0)
    assert(
        hardBot.config.colorGroupAwareness === 1.0,
        'Hard bot has full color group awareness'
    );

    // Easy bot should have low color awareness
    assert(
        easyBot.config.colorGroupAwareness < 0.5,
        'Easy bot has low color group awareness'
    );

    // Check color ranking differentiation
    const hardOrangeDiff = hardBot.colorGroupRanking['orange'] - hardBot.colorGroupRanking['brown'];
    const easyOrangeDiff = easyBot.colorGroupRanking['orange'] - easyBot.colorGroupRanking['brown'];

    assert(
        hardOrangeDiff > easyOrangeDiff,
        'Hard bot differentiates color values more than Easy bot',
        `Hard diff: ${hardOrangeDiff.toFixed(2)}, Easy diff: ${easyOrangeDiff.toFixed(2)}`
    );
}

async function testBotDifficultyTradeMultipliers() {
    log('Bot Difficulty Trade Multipliers', 'test');

    const easyBot = new Bot('http://mock', 'test', 'EasyBot', 'easy');
    const mediumBot = new Bot('http://mock', 'test', 'MediumBot', 'medium');
    const hardBot = new Bot('http://mock', 'test', 'HardBot', 'hard');

    // Hard bot requires higher cash multiplier for trades
    assert(
        hardBot.config.tradeCashMultiplier > mediumBot.config.tradeCashMultiplier,
        'Hard bot requires higher cash multiplier than Medium'
    );
    assert(
        mediumBot.config.tradeCashMultiplier > easyBot.config.tradeCashMultiplier,
        'Medium bot requires higher cash multiplier than Easy'
    );

    // Hard bot charges more for monopoly-completing trades
    assert(
        hardBot.config.monopolyGiveawayMultiplier > easyBot.config.monopolyGiveawayMultiplier,
        'Hard bot charges more for monopoly-completing property trades'
    );

    // Easy bot accepts trades more readily
    assert(
        easyBot.config.tradeAcceptThreshold < hardBot.config.tradeAcceptThreshold,
        'Easy bot accepts trades more readily'
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runAllTests() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║          MONOPOLY COMPREHENSIVE TEST SUITE                     ║');
    console.log('║          Testing all game features and mechanics               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    const startTime = Date.now();

    // Unit Tests - Game Logic
    console.log('\n\n═══ UNIT TESTS: Game Logic ═══');
    await testGameCreation();
    await testPlayerManagement();
    await testGameStart();
    await testDiceRolling();
    await testPlayerMovement();
    await testPropertyPurchase();
    await testRentCalculation();
    await testRentPayment();
    await testHouseBuilding();
    await testHotelBuilding();
    await testHouseSelling();
    await testMortgaging();
    await testJailMechanics();
    await testAuctions();
    await testTrades();
    await testBankruptcy();
    await testWinCondition();
    await testChanceCards();
    await testCommunityChestCards();
    await testLandingOnSpaces();
    await testEndTurn();
    await testBotTimeout();
    await testGameState();

    // Unit Tests - Game Manager
    console.log('\n\n═══ UNIT TESTS: Game Manager ═══');
    await testGameManager();
    await testGamePersistence();

    // Debt System Tests
    console.log('\n\n═══ DEBT SYSTEM TESTS ═══');
    await testDebtSystem();
    await testDebtWithBankruptcy();

    // Bot Difficulty Tests
    console.log('\n\n═══ BOT DIFFICULTY TESTS ═══');
    await testBotDifficultyConfigurations();
    await testBotDifficultyAuctionBehavior();
    await testBotDifficultyBlockingBehavior();
    await testBotDifficultyColorGroupAwareness();
    await testBotDifficultyTradeMultipliers();

    // Edge Cases
    console.log('\n\n═══ EDGE CASE TESTS ═══');
    await testEdgeCases();
    await testColorConsistency();

    // Integration Tests
    console.log('\n\n═══ INTEGRATION TESTS ═══');
    const serverRunning = await testSocketConnection();
    if (serverRunning) {
        await testSocketGameFlow();
        await testBotIntegration();
    }

    // Results
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                         TEST RESULTS                           ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  ✅ Passed:  ${String(testsPassed).padEnd(4)} tests                                     ║`);
    console.log(`║  ❌ Failed:  ${String(testsFailed).padEnd(4)} tests                                     ║`);
    console.log(`║  ⏭️  Skipped: ${String(testsSkipped).padEnd(4)} tests                                     ║`);
    console.log(`║  ⏱️  Duration: ${duration}s                                          ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝');

    if (testsFailed > 0) {
        console.log('\n\n❌ FAILED TESTS:');
        testResults.filter(t => t.status === 'failed').forEach(t => {
            console.log(`   - ${t.name}: ${t.reason}`);
        });
    }

    console.log('\n');

    // Return results instead of exiting when called as module
    return { passed: testsPassed, failed: testsFailed, skipped: testsSkipped };
}

// Export for test runner
module.exports = { runTests: runAllTests };

// Run directly if executed as main
if (require.main === module) {
    runAllTests().then(result => {
        process.exit(result.failed > 0 ? 1 : 0);
    }).catch(err => {
        console.error('Test suite error:', err);
        process.exit(1);
    });
}

