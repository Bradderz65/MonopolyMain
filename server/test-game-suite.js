/**
 * Comprehensive Monopoly Game Test Suite
 * Tests various game mechanics and features
 */

const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3001';

let player1, player2;
let gameId;
let testsPassed = 0;
let testsFailed = 0;

function log(msg) {
    console.log(`[TEST] ${msg}`);
}

function pass(testName) {
    testsPassed++;
    console.log(`✅ PASS: ${testName}`);
}

function fail(testName, reason) {
    testsFailed++;
    console.log(`❌ FAIL: ${testName} - ${reason}`);
}

function connectPlayer(name) {
    return new Promise((resolve) => {
        const socket = io(SERVER_URL, { transports: ['websocket'] });
        socket.on('connect', () => {
            log(`${name} connected with ID: ${socket.id}`);
            resolve(socket);
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

async function setupGame() {
    log('\n=== Setting up game ===');

    player1 = await connectPlayer('Player1');
    player2 = await connectPlayer('Player2');

    // Create game
    player1.emit('createGame', {
        playerName: 'Player1',
        gameName: 'Test Game',
        maxPlayers: 2,
        isPrivate: false,
        auctionsEnabled: false
    });

    const { gameId: gId } = await waitForEvent(player1, 'gameCreated');
    gameId = gId;
    log(`Game created: ${gameId}`);

    // Join game
    player2.emit('joinGame', { gameId, playerName: 'Player2' });
    await waitForEvent(player2, 'gameJoined');
    log('Player2 joined');

    // Start game
    player1.emit('startGame', { gameId });
    const { game } = await waitForEvent(player1, 'gameStarted');
    log('Game started');

    return game;
}

async function testJailMechanics() {
    log('\n=== Test: Jail Mechanics ===');

    // This is a unit test - we'll test the Game class directly
    const { Game } = require('./game');
    const game = new Game('TEST', 'Test', 2, false, false);

    game.addPlayer('p1', 'Player1');
    game.addPlayer('p2', 'Player2');
    game.start();

    const player = game.players[0];

    // Send to jail
    game.sendToJail(player);

    if (player.inJail && player.position === 10) {
        pass('Player sent to jail correctly');
    } else {
        fail('Player sent to jail', `inJail: ${player.inJail}, position: ${player.position}`);
    }

    // Pay jail fine
    const initialMoney = player.money;
    const result = game.payJailFine(player);

    if (result.success && !player.inJail && player.money === initialMoney - 50) {
        pass('Jail fine payment works');
    } else {
        fail('Jail fine payment', `success: ${result.success}, inJail: ${player.inJail}`);
    }

    // Test dice reset after jail
    if (!game.diceRolled) {
        pass('Dice reset after paying jail fine');
    } else {
        fail('Dice reset after jail', 'diceRolled should be false');
    }
}

async function testPropertyPurchase() {
    log('\n=== Test: Property Purchase ===');

    const { Game } = require('./game');
    const game = new Game('TEST2', 'Test', 2, false, false);

    game.addPlayer('p1', 'Player1');
    game.addPlayer('p2', 'Player2');
    game.start();

    const player = game.players[0];
    player.position = 1; // Mediterranean Avenue

    // Set pending action
    game.pendingAction = { type: 'buyOrAuction', property: game.board[1] };

    const initialMoney = player.money;
    const result = game.buyProperty();

    if (result.success && game.board[1].owner === player.id) {
        pass('Property purchased correctly');
    } else {
        fail('Property purchase', `success: ${result.success}`);
    }

    if (player.money === initialMoney - game.board[1].price) {
        pass('Money deducted correctly');
    } else {
        fail('Money deduction', `expected: ${initialMoney - game.board[1].price}, got: ${player.money}`);
    }

    if (!game.pendingAction) {
        pass('Pending action cleared after purchase');
    } else {
        fail('Pending action clear', 'pendingAction should be null');
    }
}

async function testRentPayment() {
    log('\n=== Test: Rent Payment ===');

    const { Game } = require('./game');
    const game = new Game('TEST3', 'Test', 2, false, false);

    game.addPlayer('p1', 'Player1');
    game.addPlayer('p2', 'Player2');
    game.start();

    const owner = game.players[0];
    const renter = game.players[1];

    // Owner buys property
    game.board[1].owner = owner.id;
    owner.properties.push(1);

    const ownerInitial = owner.money;
    const renterInitial = renter.money;
    const rent = game.board[1].rent[0];

    game.payRent(renter, game.board[1], rent);

    if (owner.money === ownerInitial + rent) {
        pass('Owner received rent');
    } else {
        fail('Owner rent', `expected: ${ownerInitial + rent}, got: ${owner.money}`);
    }

    if (renter.money === renterInitial - rent) {
        pass('Renter paid rent');
    } else {
        fail('Renter payment', `expected: ${renterInitial - rent}, got: ${renter.money}`);
    }
}

async function testBuildingHouses() {
    log('\n=== Test: Building Houses ===');

    const { Game } = require('./game');
    const game = new Game('TEST4', 'Test', 2, false, false);

    game.addPlayer('p1', 'Player1');
    game.start();

    const player = game.players[0];

    // Give player all brown properties
    const brownProps = game.board.filter(s => s.color === 'brown');
    brownProps.forEach(prop => {
        prop.owner = player.id;
        player.properties.push(game.board.indexOf(prop));
    });

    const initialMoney = player.money;
    const propIndex = game.board.findIndex(s => s.color === 'brown');
    const houseCost = game.board[propIndex].houseCost;

    const result = game.buildHouse(player, propIndex);

    if (result.success && game.board[propIndex].houses === 1) {
        pass('House built successfully');
    } else {
        fail('House building', `success: ${result.success}, houses: ${game.board[propIndex].houses}`);
    }

    if (player.money === initialMoney - houseCost) {
        pass('House cost deducted');
    } else {
        fail('House cost', `expected: ${initialMoney - houseCost}, got: ${player.money}`);
    }
}

async function testMortgage() {
    log('\n=== Test: Mortgage ===');

    const { Game } = require('./game');
    const game = new Game('TEST5', 'Test', 2, false, false);

    game.addPlayer('p1', 'Player1');
    game.start();

    const player = game.players[0];
    game.board[1].owner = player.id;
    player.properties.push(1);

    const initialMoney = player.money;
    const mortgageValue = game.board[1].mortgage;

    const result = game.mortgageProperty(player, 1);

    if (result.success && game.board[1].mortgaged) {
        pass('Property mortgaged');
    } else {
        fail('Mortgage', `success: ${result.success}`);
    }

    if (player.money === initialMoney + mortgageValue) {
        pass('Mortgage money received');
    } else {
        fail('Mortgage money', `expected: ${initialMoney + mortgageValue}, got: ${player.money}`);
    }
}

async function testAuctionMinimumBid() {
    log('\n=== Test: Auction Minimum Bid ===');

    const { Game } = require('./game');
    const game = new Game('TEST6', 'Test', 2, false, true); // auctions enabled

    game.addPlayer('p1', 'Player1');
    game.addPlayer('p2', 'Player2');
    game.start();

    game.pendingAction = { type: 'buyOrAuction', property: game.board[1] };
    game.startAuction();

    if (game.auction.minimumBid === 10) {
        pass('Auction has £10 minimum bid');
    } else {
        fail('Minimum bid', `expected: 10, got: ${game.auction.minimumBid}`);
    }

    // Try bid below minimum
    const player = game.players[1];
    const result = game.placeBid(player, 5);

    if (!result.success) {
        pass('Bid below minimum rejected');
    } else {
        fail('Bid validation', 'Should reject bids below minimum');
    }

    // Try valid bid
    const result2 = game.placeBid(player, 15);

    if (result2.success && game.auction.currentBid === 15) {
        pass('Valid bid accepted');
    } else {
        fail('Valid bid', `success: ${result2.success}`);
    }
}

async function testGamePersistence() {
    log('\n=== Test: Game Persistence ===');

    const GameManager = require('./gameManager');
    const fs = require('fs');
    const path = require('path');

    const gm = new GameManager();
    const game = gm.createGame('Persist Test', 2, false, false);
    game.addPlayer('p1', 'Player1');
    game.start();
    game.players[0].money = 9999; // Modify state

    gm.saveGames();

    const savePath = path.join(__dirname, 'saved_games.json');
    if (fs.existsSync(savePath)) {
        pass('Games saved to disk');

        const data = JSON.parse(fs.readFileSync(savePath, 'utf8'));
        if (data.length > 0 && data[0].players?.[0]?.money === 9999) {
            pass('Game state preserved correctly');
        } else {
            fail('Game state', 'State not preserved');
        }

        // Cleanup
        fs.unlinkSync(savePath);
    } else {
        fail('Save file', 'File not created');
    }
}

async function runAllTests() {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║   MONOPOLY GAME TEST SUITE           ║');
    console.log('╚══════════════════════════════════════╝\n');

    try {
        await testJailMechanics();
        await testPropertyPurchase();
        await testRentPayment();
        await testBuildingHouses();
        await testMortgage();
        await testAuctionMinimumBid();
        await testGamePersistence();

        console.log('\n╔══════════════════════════════════════╗');
        console.log(`║   RESULTS: ${testsPassed} passed, ${testsFailed} failed          ║`);
        console.log('╚══════════════════════════════════════╝\n');

    } catch (err) {
        console.error('Test error:', err);
    }

    return { passed: testsPassed, failed: testsFailed, skipped: 0 };
}

// Export for test runner
module.exports = { runTests: runAllTests };

// Run directly if executed as main
if (require.main === module) {
    runAllTests().then(result => {
        process.exit(result.failed > 0 ? 1 : 0);
    });
}
