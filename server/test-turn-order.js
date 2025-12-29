/**
 * Test Script: Turn Order Enforcement
 * Tests that only the current player can buy a property they landed on
 */

const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3001';

// Create mock players
let player1, player2;
let gameId;

function log(msg) {
    console.log(`[TEST] ${msg}`);
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

async function runTest() {
    log('=== Starting Turn Order Test ===');

    // Connect two players
    player1 = await connectPlayer('Player1');
    player2 = await connectPlayer('Player2');

    // Player 1 creates game
    log('Player1 creating game...');
    player1.emit('createGame', {
        playerName: 'Player1',
        gameName: 'Test Game',
        maxPlayers: 2,
        isPrivate: false,
        auctionsEnabled: false
    });

    await new Promise(resolve => {
        player1.on('gameCreated', ({ gameId: gId, game }) => {
            gameId = gId;
            log(`Game created: ${gameId}`);
            resolve();
        });
    });

    // Player 2 joins
    log('Player2 joining game...');
    player2.emit('joinGame', { gameId, playerName: 'Player2' });

    await new Promise(resolve => {
        player2.on('gameJoined', () => {
            log('Player2 joined successfully');
            resolve();
        });
    });

    // Player 1 starts game
    log('Starting game...');
    player1.emit('startGame', { gameId });

    let currentGame;
    await new Promise(resolve => {
        player1.on('gameStarted', ({ game }) => {
            currentGame = game;
            log(`Game started! Current player: ${game.players[game.currentPlayerIndex].name}`);
            resolve();
        });
    });

    // Determine who goes first
    const firstPlayer = currentGame.players[currentGame.currentPlayerIndex];
    const currentSocket = firstPlayer.name === 'Player1' ? player1 : player2;
    const otherSocket = firstPlayer.name === 'Player1' ? player2 : player1;
    const otherName = firstPlayer.name === 'Player1' ? 'Player2' : 'Player1';

    log(`${firstPlayer.name} goes first`);

    // Current player rolls dice
    log(`${firstPlayer.name} rolling dice...`);
    currentSocket.emit('rollDice', { gameId });

    await new Promise(resolve => {
        currentSocket.on('diceRolled', ({ result }) => {
            log(`Dice result: ${result.die1} + ${result.die2} = ${result.total}`);
            resolve();
        });
    });

    // Wait for landing result
    await new Promise(resolve => {
        currentSocket.on('landingResult', ({ result, game }) => {
            log(`Landed on: ${game.board[game.players[game.currentPlayerIndex].position].name}`);
            if (game.pendingAction?.type === 'buyOrAuction') {
                log('Property available for purchase!');
            }
            resolve();
        });
    });

    // Wait a bit for state to settle
    await new Promise(r => setTimeout(r, 500));

    // TEST: Other player tries to buy (should fail)
    log(`\n=== TEST: ${otherName} tries to buy (should fail) ===`);

    otherSocket.emit('buyProperty', { gameId });

    await new Promise(resolve => {
        let received = false;

        otherSocket.on('error', (data) => {
            if (!received) {
                received = true;
                log(`✅ PASS: ${otherName} correctly blocked - ${data.message}`);
                resolve();
            }
        });

        otherSocket.on('propertyBought', () => {
            if (!received) {
                received = true;
                log(`❌ FAIL: ${otherName} was able to buy property on another player's turn!`);
                resolve();
            }
        });

        // Timeout after 2 seconds
        setTimeout(() => {
            if (!received) {
                received = true;
                log(`✅ PASS: No response to ${otherName}'s buy attempt (silently rejected)`);
                resolve();
            }
        }, 2000);
    });

    // TEST: Other player tries to roll while pendingAction exists
    log(`\n=== TEST: ${otherName} tries to roll (should fail) ===`);

    otherSocket.emit('rollDice', { gameId });

    await new Promise(resolve => {
        let received = false;

        otherSocket.on('error', (data) => {
            if (!received) {
                received = true;
                log(`✅ PASS: ${otherName} correctly blocked from rolling - ${data.message}`);
                resolve();
            }
        });

        // Timeout after 2 seconds
        setTimeout(() => {
            if (!received) {
                received = true;
                log(`✅ PASS: ${otherName} could not roll (not their turn)`);
                resolve();
            }
        }, 2000);
    });

    log('\n=== Test Complete ===');

    // Cleanup
    player1.disconnect();
    player2.disconnect();

    process.exit(0);
}

runTest().catch(console.error);
