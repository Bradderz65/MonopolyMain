const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const GameManager = require('./gameManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/build')));

const gameManager = new GameManager();

// API Routes
app.get('/api/games', (req, res) => {
  res.json(gameManager.getPublicGames());
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', games: gameManager.getGameCount() });
});

// Reset all games endpoint
app.post('/api/reset', (req, res) => {
  console.log('[SERVER] Resetting all games...');
  gameManager.resetAllGames();
  io.emit('gamesUpdated', []);
  res.json({ success: true, message: 'All games have been reset' });
});

// Debug endpoint to force advance turn
app.get('/api/debug/advance-turn/:gameId', (req, res) => {
  const game = gameManager.getGame(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  game.endTurn();
  io.to(game.id).emit('turnEnded', { game: game.getState() });
  res.json({ success: true, currentPlayer: game.players[game.currentPlayerIndex]?.name });
});

// Debug endpoint to release current player from jail
app.get('/api/debug/release-jail/:gameId', (req, res) => {
  const game = gameManager.getGame(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  const player = game.players[game.currentPlayerIndex];
  player.inJail = false;
  player.jailTurns = 0;
  game.diceRolled = false;
  io.to(game.id).emit('turnEnded', { game: game.getState() });
  res.json({ success: true, releasedPlayer: player.name });
});

// Debug endpoint to move player by name (moves ALL with that name)
app.get('/api/debug/move-player/:gameId/:playerName/:position', (req, res) => {
  const game = gameManager.getGame(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  const players = game.players.filter(p => p.name === req.params.playerName);
  if (players.length === 0) {
    return res.status(404).json({ error: 'Player not found' });
  }
  players.forEach(player => {
    player.position = parseInt(req.params.position);
    player.inJail = false;
    player.jailTurns = 0;
  });
  game.diceRolled = false;
  io.to(game.id).emit('turnEnded', { game: game.getState() });
  res.json({ success: true, movedCount: players.length, position: parseInt(req.params.position) });
});

// Debug endpoint to give any property to any player
app.get('/api/debug/give-property/:gameId/:playerName/:propertyIndex', (req, res) => {
  const game = gameManager.getGame(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  const propertyIndex = parseInt(req.params.propertyIndex);
  const property = game.board[propertyIndex];

  if (!property) {
    return res.status(404).json({ error: 'Property not found', validRange: `0-${game.board.length - 1}` });
  }

  if (!property.price) {
    return res.status(400).json({ error: 'This space is not a buyable property', spaceName: property.name, type: property.type });
  }

  // Find the target player
  const targetPlayer = game.players.find(p => p.name === req.params.playerName);
  if (!targetPlayer) {
    return res.status(404).json({ error: 'Player not found', availablePlayers: game.players.map(p => p.name) });
  }

  // Remove property from previous owner (if any)
  const previousOwner = game.players.find(p => p.id === property.owner);
  if (previousOwner) {
    previousOwner.properties = previousOwner.properties.filter(idx => idx !== propertyIndex);
  }

  // Give property to new owner
  property.owner = targetPlayer.id;
  if (!targetPlayer.properties.includes(propertyIndex)) {
    targetPlayer.properties.push(propertyIndex);
  }

  // Unmortgage the property if it was mortgaged
  property.mortgaged = false;

  game.addLog(`[DEBUG] ${property.name} given to ${targetPlayer.name}`);
  io.to(game.id).emit('turnEnded', { game: game.getState() });

  res.json({
    success: true,
    property: property.name,
    newOwner: targetPlayer.name,
    previousOwner: previousOwner?.name || 'Unowned'
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Get available tokens and colors for character selection
  socket.on('getCharacterOptions', ({ gameId }) => {
    const { Game } = require('./game');
    if (gameId) {
      const game = gameManager.getGame(gameId);
      if (game) {
        socket.emit('characterOptions', {
          tokens: game.getAvailableTokens(),
          colors: game.getAvailableColors(),
          allTokens: Game.getAllTokens(),
          allColors: Game.getAllColors()
        });
        return;
      }
    }
    // No game yet - return all options
    socket.emit('characterOptions', {
      tokens: Game.getAllTokens(),
      colors: Game.getAllColors(),
      allTokens: Game.getAllTokens(),
      allColors: Game.getAllColors()
    });
  });

  socket.on('createGame', ({ playerName, gameName, maxPlayers, isPrivate, auctionsEnabled, tokenId, colorId }) => {
    try {
      const game = gameManager.createGame(gameName, maxPlayers, isPrivate, auctionsEnabled || false);
      const player = game.addPlayer(socket.id, playerName, tokenId, colorId);
      
      if (!player) {
         socket.emit('error', { message: 'Failed to create game player' });
         return;
      }

      socket.join(game.id);
      socket.emit('gameCreated', { gameId: game.id, player, game: game.getState() });
      io.emit('gamesUpdated', gameManager.getPublicGames());
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('joinGame', ({ gameId, playerName, isBot, botDifficulty, tokenId, colorId }) => {
    const game = gameManager.getGame(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    if (game.started) {
      socket.emit('error', { message: 'Game already started' });
      return;
    }
    if (game.players.length >= game.maxPlayers) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }
    
    try {
      // Bots automatically get assigned available token/color (pass null)
      const player = game.addPlayer(socket.id, playerName, isBot ? null : tokenId, isBot ? null : colorId);
      
      if (!player) {
         socket.emit('error', { message: 'Failed to join game' });
         return;
      }

      if (isBot) {
        player.isBot = true;
        player.botDifficulty = botDifficulty || 'hard';
      }
      socket.join(game.id);
      socket.emit('gameJoined', { gameId: game.id, player, game: game.getState() });
      socket.to(game.id).emit('playerJoined', { player, game: game.getState() });
      io.emit('gamesUpdated', gameManager.getPublicGames());
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Unified rejoin handler - reconnects a bot or human player to an existing game
  socket.on('rejoinGame', ({ gameId, playerName, playerId, isBot }) => {
    console.log(`[SERVER] rejoinGame attempt: gameId=${gameId}, playerName=${playerName}, playerId=${playerId}, isBot=${isBot}`);
    const game = gameManager.getGame(gameId);
    if (!game) {
      console.log(`[SERVER] rejoinGame failed: game not found`);
      socket.emit('rejoinFailed', { message: 'Game not found' });
      return;
    }

    // Find the existing player by name first, then by playerId
    let existingPlayer = game.players.find(p => p.name === playerName);
    if (!existingPlayer && playerId) {
      existingPlayer = game.players.find(p => p.id === playerId);
    }

    if (!existingPlayer) {
      console.log(`[SERVER] rejoinGame failed: player not found`);
      socket.emit('rejoinFailed', { message: 'Player not found in game' });
      return;
    }

    // Store old ID to update property ownership
    const oldSocketId = existingPlayer.id;

    // Update the player's socket ID and connection status
    existingPlayer.id = socket.id;
    existingPlayer.disconnected = false;
    if (isBot !== undefined) existingPlayer.isBot = isBot;

    // Update property ownership to use new socket ID
    game.board.forEach(space => {
      if (space.owner === oldSocketId) {
        space.owner = socket.id;
      }
    });

    socket.join(game.id);

    // Send appropriate event based on whether it's a bot or human
    if (isBot) {
      socket.emit('gameJoined', { gameId: game.id, player: existingPlayer, game: game.getState() });
    } else {
      socket.emit('gameRejoined', { game: game.getState() });
    }

    socket.to(game.id).emit('playerReconnected', { player: existingPlayer, game: game.getState() });
    console.log(`[SERVER] rejoinGame SUCCESS: ${playerName} rejoined game ${gameId}`);

    // Check if it's the player's turn and trigger action (for bots)
    if (isBot) {
      const playerIndex = game.players.indexOf(existingPlayer);
      if (game.started && game.currentPlayerIndex === playerIndex) {
        setTimeout(() => {
          socket.emit('turnEnded', { game: game.getState() });
        }, 1000);
      }
    }
  });

  socket.on('startGame', ({ gameId }) => {
    const game = gameManager.getGame(gameId);
    if (!game) return;
    const player = game.getPlayer(socket.id);
    if (!player || !player.isHost) {
      socket.emit('error', { message: 'Only host can start the game' });
      return;
    }
    if (game.players.length < 1) {
      socket.emit('error', { message: 'Need at least 1 player' });
      return;
    }
    game.start();
    io.to(game.id).emit('gameStarted', { game: game.getState() });
    io.emit('gamesUpdated', gameManager.getPublicGames());
  });

  socket.on('addBot', ({ gameId, difficulty }) => {
    const game = gameManager.getGame(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    if (game.started) {
      socket.emit('error', { message: 'Game already started' });
      return;
    }
    if (game.players.length >= game.maxPlayers) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }

    // Validate difficulty level
    const validDifficulties = ['easy', 'medium', 'hard'];
    const botDifficulty = validDifficulties.includes(difficulty) ? difficulty : 'hard';
    console.log(`Adding bot with difficulty: ${botDifficulty}`);

    // Spawn a bot with specified difficulty
    const MonopolyBot = require('./bot');
    const bot = new MonopolyBot('http://localhost:3001', gameId, null, botDifficulty);
    bot.connect().then(() => {
      bot.joinGame();
    }).catch(err => {
      console.error('Bot connection error:', err);
    });
  });

  socket.on('rollDice', ({ gameId }) => {
    console.log(`[SERVER] rollDice called by ${socket.id} for game ${gameId}`);
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) {
      console.log('[SERVER] rollDice rejected: game not found or not started');
      return;
    }
    const player = game.getPlayer(socket.id);
    if (!player || game.currentPlayerIndex !== game.players.indexOf(player)) {
      console.log('[SERVER] rollDice rejected: not player\'s turn');
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    if (game.diceRolled && !game.canRollAgain) {
      console.log('[SERVER] rollDice rejected: already rolled');
      socket.emit('error', { message: 'Already rolled' });
      return;
    }
    // Don't allow rolling if there's a pending action or auction
    if (game.pendingAction) {
      console.log('[SERVER] rollDice rejected: pending action exists');
      socket.emit('error', { message: 'Complete pending action first' });
      return;
    }
    if (game.auction) {
      console.log('[SERVER] rollDice rejected: auction in progress');
      socket.emit('error', { message: 'Wait for auction to complete' });
      return;
    }
    const now = Date.now();
    if (game.rollCooldownPlayerId === player.id && game.rollCooldownUntil && now < game.rollCooldownUntil) {
      console.log('[SERVER] rollDice rejected: roll cooldown active');
      socket.emit('error', { message: 'Roll cooldown active' });
      return;
    }
    if (game.rollInProgress) {
      console.log('[SERVER] rollDice rejected: roll already in progress');
      socket.emit('error', { message: 'Roll already in progress' });
      return;
    }
    game.rollInProgress = true;
    game.rollCooldownPlayerId = player.id;
    game.rollCooldownUntil = now + 1200;
    const result = game.rollDice();
    console.log(`[SERVER] rollDice SUCCESS for ${player.name}: ${result.die1} + ${result.die2} = ${result.total}`);
    io.to(game.id).emit('diceRolled', { result, game: game.getState() });

    // Handle landing on space
    setTimeout(() => {
      const landingResult = game.handleLanding();
      game.rollInProgress = false;
      io.to(game.id).emit('landingResult', { result: landingResult, game: game.getState() });
    }, 1000);
  });

  socket.on('buyProperty', ({ gameId }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player || game.currentPlayerIndex !== game.players.indexOf(player)) return;
    const result = game.buyProperty();
    if (result.success) {
      io.to(game.id).emit('propertyBought', { result, game: game.getState() });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  socket.on('auctionBid', ({ gameId, amount }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.auction) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const result = game.placeBid(player, amount);
    io.to(game.id).emit('auctionUpdate', { auction: game.auction, game: game.getState() });
  });

  socket.on('auctionPass', ({ gameId }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.auction) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    game.passBid(player);
    io.to(game.id).emit('auctionUpdate', { auction: game.auction, game: game.getState() });
  });

  socket.on('declineProperty', ({ gameId }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player || game.currentPlayerIndex !== game.players.indexOf(player)) return;

    if (game.auctionsEnabled) {
      // Start auction if enabled
      game.startAuction();
      io.to(game.id).emit('auctionStarted', { auction: game.auction, game: game.getState() });

      // Auto-complete auction after 15 seconds if no bids
      setTimeout(() => {
        if (game.auction && !game.auction.highestBidder) {
          game.addLog(`No bids placed - ${game.auction.property.name} remains unsold`);
          game.auction = null;
          io.to(game.id).emit('auctionUpdate', { auction: null, game: game.getState() });
        }
      }, 15000);
    } else {
      // No auction - property stays unsold
      const propertyName = game.pendingAction?.property?.name || 'property';
      game.addLog(`${player.name} declined to buy ${propertyName}`);
      game.pendingAction = null;
      io.to(game.id).emit('propertyDeclined', { game: game.getState() });
    }
  });

  socket.on('buildHouse', ({ gameId, propertyIndex }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const result = game.buildHouse(player, propertyIndex);
    if (result.success) {
      io.to(game.id).emit('houseBuilt', { result, game: game.getState() });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  socket.on('sellHouse', ({ gameId, propertyIndex }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const result = game.sellHouse(player, propertyIndex);
    if (result.success) {
      io.to(game.id).emit('houseSold', { result, game: game.getState() });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  socket.on('mortgageProperty', ({ gameId, propertyIndex }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const result = game.mortgageProperty(player, propertyIndex);
    if (result.success) {
      io.to(game.id).emit('propertyMortgaged', { result, game: game.getState() });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  socket.on('unmortgageProperty', ({ gameId, propertyIndex }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const result = game.unmortgageProperty(player, propertyIndex);
    if (result.success) {
      io.to(game.id).emit('propertyUnmortgaged', { result, game: game.getState() });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  socket.on('proposeTrade', ({ gameId, targetPlayerId, offer, request }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const trade = game.proposeTrade(player, targetPlayerId, offer, request);
    io.to(game.id).emit('tradeProposed', { trade, game: game.getState() });
  });

  socket.on('acceptTrade', ({ gameId, tradeId }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const result = game.acceptTrade(tradeId, player);
    if (result.success) {
      io.to(game.id).emit('tradeCompleted', { result, game: game.getState() });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  socket.on('declineTrade', ({ gameId, tradeId }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;

    // Find the trade to get info about who declined it
    const trade = game.trades.find(t => t.id === tradeId);
    const declinedByPlayer = trade?.to;

    game.declineTrade(tradeId);
    io.to(game.id).emit('tradeDeclined', {
      tradeId,
      declinedByPlayer,
      game: game.getState()
    });
  });

  socket.on('payJailFine', ({ gameId }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const result = game.payJailFine(player);
    if (result.success) {
      io.to(game.id).emit('jailFinePaid', { result, game: game.getState() });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  socket.on('useJailCard', ({ gameId }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const result = game.useJailCard(player);
    if (result.success) {
      io.to(game.id).emit('jailCardUsed', { result, game: game.getState() });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  socket.on('endTurn', ({ gameId }) => {
    console.log(`[SERVER] endTurn called by ${socket.id} for game ${gameId}`);
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) {
      console.log(`[SERVER] endTurn rejected: game not found or not started`);
      return;
    }
    const player = game.getPlayer(socket.id);
    if (!player) {
      console.log(`[SERVER] endTurn rejected: player not found for socket ${socket.id}`);
      return;
    }
    const playerIndex = game.players.indexOf(player);
    if (game.currentPlayerIndex !== playerIndex) {
      console.log(`[SERVER] endTurn rejected: not player's turn (currentIndex: ${game.currentPlayerIndex}, playerIndex: ${playerIndex})`);
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    if (!game.diceRolled) {
      console.log(`[SERVER] endTurn rejected: dice not rolled`);
      socket.emit('error', { message: 'Must roll dice first' });
      return;
    }
    if (game.pendingAction) {
      console.log(`[SERVER] endTurn rejected: pending action exists:`, game.pendingAction.type);
      socket.emit('error', { message: 'Must complete pending action first' });
      return;
    }
    if (game.auction) {
      console.log(`[SERVER] endTurn rejected: auction in progress`);
      socket.emit('error', { message: 'Wait for auction to complete' });
      return;
    }
    console.log(`[SERVER] endTurn SUCCESS for ${player.name}, advancing turn`);
    game.endTurn();
    io.to(game.id).emit('turnEnded', { game: game.getState() });
  });

  socket.on('declareBankruptcy', ({ gameId }) => {
    const game = gameManager.getGame(gameId);
    if (!game || !game.started) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const result = game.declareBankruptcy(player);
    io.to(game.id).emit('playerBankrupt', { result, game: game.getState() });

    if (game.checkWinner()) {
      io.to(game.id).emit('gameOver', { winner: game.getWinner(), game: game.getState() });
    }
  });

  socket.on('leaveGame', ({ gameId }) => {
    const game = gameManager.getGame(gameId);
    if (!game) return;

    const result = game.removePlayer(socket.id);
    socket.leave(game.id);

    // Check if any active humans remain (not bots, not bankrupt)
    const activeHumans = game.players.filter(p => !p.isBot && !p.bankrupt);

    if (activeHumans.length === 0) {
      console.log(`[SERVER] No humans left in game ${gameId} - ending game`);
      gameManager.removeGame(gameId);
    } else if (game.players.length === 0 || game.players.every(p => p.bankrupt)) {
      gameManager.removeGame(gameId);
    } else {
      // Notify all players about the removal
      io.to(game.id).emit('playerLeft', {
        playerId: socket.id,
        playerName: result?.removed?.name,
        game: game.getState()
      });

      // Check if there's a winner
      if (result?.winner) {
        io.to(game.id).emit('gameOver', { winner: result.winner, game: game.getState() });
      }
    }
    io.emit('gamesUpdated', gameManager.getPublicGames());
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const games = gameManager.getPlayerGames(socket.id);
    games.forEach(game => {
      game.setPlayerDisconnected(socket.id);
      io.to(game.id).emit('playerDisconnected', { playerId: socket.id, game: game.getState() });
    });
  });
});

// Serve React app for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Save games on shutdown
const shutdown = () => {
  console.log('\nSaving games before shutdown...');
  gameManager.saveGames();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle nodemon restart - save before it kills the process
process.once('SIGUSR2', () => {
  console.log('\n[NODEMON] Saving games before restart...');
  gameManager.saveGames();
  process.kill(process.pid, 'SIGUSR2');
});

// Auto-save every 30 seconds for safety
setInterval(() => {
  if (gameManager.getGameCount() > 0) {
    gameManager.saveGames();
  }
}, 30000);

// Check for stalled bots every 5 seconds
setInterval(() => {
  const timeouts = gameManager.checkBotTimeouts();
  timeouts.forEach(({ gameId, result }) => {
    console.log(`[SERVER] Forced turn skip for stalled bot in game ${gameId}`);
    io.to(gameId).emit('turnEnded', { game: result.game });
  });
}, 5000);

module.exports = { app, server, io };
