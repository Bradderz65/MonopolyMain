const io = require('socket.io-client');

async function testGameLoop() {
    const socket = io('http://localhost:3001');
    const gameId = '8733874C'; // Target game from logs

    console.log('Connecting to server...');

    socket.on('connect', () => {
        console.log('Connected to server via Socket.IO');
        // Try to join as an observer/new player
        socket.emit('joinGame', { gameId, playerName: 'DebugObserver' });
    });

    socket.on('gameJoined', ({ game }) => {
        console.log('[SUCCESS] Joined game!');
        logGameState(game);
    });

    socket.on('error', (data) => {
        console.log('[ERROR]', data.message);
        if (data.message === 'Game not found') {
            console.log('Game ID missing. Exiting.');
            process.exit(1);
        }
    });

    socket.on('turnEnded', ({ game }) => {
        console.log('------------------------------------------------');
        console.log('[EVENT] turnEnded received');
        logGameState(game);
    });

    socket.on('diceRolled', ({ result, game }) => {
        console.log(`[EVENT] diceRolled: Total ${result.total}, Doubles: ${result.isDoubles}`);
    });

    socket.on('landingResult', ({ result, game }) => {
        console.log(`[EVENT] landingResult: ${result.action || result.type} on ${result.space?.name}`);
    });

    function logGameState(game) {
        const currentPlayer = game.players[game.currentPlayerIndex];
        console.log(`Current Player: ${currentPlayer.name} (Index: ${game.currentPlayerIndex})`);
        console.log(`Status: ${currentPlayer.isBot ? 'BOT' : 'HUMAN'}`);
        console.log(`Money: ${currentPlayer.money}`);
        console.log(`Position: ${currentPlayer.position} (${game.board[currentPlayer.position].name})`);
    }

    // Keep running
}

testGameLoop();
