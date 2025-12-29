const { v4: uuidv4 } = require('uuid');
const { Game } = require('./game');
const fs = require('fs');
const path = require('path');

const SAVE_FILE = path.join(__dirname, 'saved_games.json');

class GameManager {
  constructor() {
    this.games = new Map();
    this.loadGames();
  }

  saveGames() {
    try {
      const gamesToSave = [];
      this.games.forEach((game, id) => {
        if (game.started) {
          // Save full game state for started games
          gamesToSave.push({
            id: game.id,
            name: game.name,
            maxPlayers: game.maxPlayers,
            isPrivate: game.isPrivate,
            players: game.players,
            started: game.started,
            currentPlayerIndex: game.currentPlayerIndex,
            board: game.board,
            chanceCards: game.chanceCards,
            communityChestCards: game.communityChestCards,
            chanceIndex: game.chanceIndex,
            communityChestIndex: game.communityChestIndex,
            diceRolled: game.diceRolled,
            lastDiceRoll: game.lastDiceRoll,
            canRollAgain: game.canRollAgain,
            doublesCount: game.doublesCount,
            pendingAction: game.pendingAction,
            auction: game.auction,
            trades: game.trades,
            gameLog: game.gameLog,
            freeParking: game.freeParking,
            housesAvailable: game.housesAvailable,
            hotelsAvailable: game.hotelsAvailable
          });
        }
      });
      fs.writeFileSync(SAVE_FILE, JSON.stringify(gamesToSave, null, 2));
      console.log(`Saved ${gamesToSave.length} games to disk`);
    } catch (err) {
      console.error('Failed to save games:', err);
    }
  }

  loadGames() {
    try {
      if (fs.existsSync(SAVE_FILE)) {
        const data = fs.readFileSync(SAVE_FILE, 'utf8');
        const savedGames = JSON.parse(data);
        const botsToRespawn = [];

        savedGames.forEach(savedGame => {
          const game = new Game(savedGame.id, savedGame.name, savedGame.maxPlayers, savedGame.isPrivate);
          // Restore all game state
          Object.assign(game, savedGame);
          // Mark all players as disconnected initially
          game.players.forEach(p => {
            p.disconnected = true;
            // Track bots to respawn with their difficulty
            if (p.isBot) {
              botsToRespawn.push({ gameId: game.id, botName: p.name, botDifficulty: p.botDifficulty || 'hard' });
            }
          });
          this.games.set(game.id, game);
        });
        console.log(`Loaded ${savedGames.length} saved games from disk`);

        // Respawn bots after a short delay
        if (botsToRespawn.length > 0) {
          setTimeout(() => {
            const MonopolyBot = require('./bot');
            botsToRespawn.forEach(({ gameId, botName, botDifficulty }) => {
              console.log(`Respawning bot ${botName} for game ${gameId} (difficulty: ${botDifficulty})`);
              const bot = new MonopolyBot('http://localhost:3001', gameId, botName, botDifficulty);
              bot.connect().then(() => {
                bot.rejoinGame();
              }).catch(err => {
                console.error(`Failed to respawn bot ${botName}:`, err);
              });
            });
          }, 2000);
        }
      }
    } catch (err) {
      console.error('Failed to load saved games:', err);
    }
  }

  createGame(name, maxPlayers = 4, isPrivate = false, auctionsEnabled = false) {
    const id = uuidv4().substring(0, 8).toUpperCase();
    const game = new Game(id, name, maxPlayers, isPrivate, auctionsEnabled);
    this.games.set(id, game);
    return game;
  }

  getGame(id) {
    return this.games.get(id);
  }

  removeGame(id) {
    this.games.delete(id);
  }

  getPublicGames() {
    const publicGames = [];
    this.games.forEach((game, id) => {
      if (!game.isPrivate && !game.started) {
        publicGames.push({
          id: game.id,
          name: game.name,
          players: game.players.length,
          maxPlayers: game.maxPlayers,
          host: game.players[0]?.name || 'Unknown'
        });
      }
    });
    return publicGames;
  }

  getGameCount() {
    return this.games.size;
  }

  getPlayerGames(socketId) {
    const playerGames = [];
    this.games.forEach(game => {
      if (game.getPlayer(socketId)) {
        playerGames.push(game);
      }
    });
    return playerGames;
  }

  checkBotTimeouts() {
    const results = [];
    this.games.forEach(game => {
      const result = game.checkBotTimeout();
      if (result) {
        results.push({ gameId: game.id, result });
      }
    });
    return results;
  }

  resetAllGames() {
    // Clear all games from memory
    this.games.clear();

    // Delete the save file
    try {
      if (fs.existsSync(SAVE_FILE)) {
        fs.unlinkSync(SAVE_FILE);
        console.log('Deleted saved games file');
      }
    } catch (err) {
      console.error('Error deleting save file:', err);
    }

    console.log('All games have been reset');
  }
}

module.exports = GameManager;
