import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import sounds from './utils/sounds';
import './App.css';

const SOCKET_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : `http://${window.location.hostname}:3001`;

function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('monopoly_playerName') || '');
  const [currentGame, setCurrentGame] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [games, setGames] = useState([]);
  const [error, setError] = useState('');
  const [gameState, setGameState] = useState(null);
  const [currentCard, setCurrentCard] = useState(null);
  const [eventToast, setEventToast] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [rejoining, setRejoining] = useState(false);
  const [animatingPlayer, setAnimatingPlayer] = useState(null);
  const gameStateRef = useRef(null);
  const currentPlayerRef = useRef(null);

  // Helper to update game state while preserving the lastDiceRoll object reference
  // if the values are identical. This prevents unnecessary re-animations of the dice.
  const updateGameStateSafely = useCallback((newGame) => {
    setGameState(prev => {
      if (!prev || !newGame) return newGame;
      
      // Check if lastDiceRoll exists in both and has same values
      if (prev.lastDiceRoll && newGame.lastDiceRoll &&
          prev.lastDiceRoll.die1 === newGame.lastDiceRoll.die1 &&
          prev.lastDiceRoll.die2 === newGame.lastDiceRoll.die2 &&
          prev.lastDiceRoll.total === newGame.lastDiceRoll.total) {
        
        // Return new game state but with the OLD lastDiceRoll object reference
        // This ensures strict equality checks (roll !== prevRoll) return false
        return {
          ...newGame,
          lastDiceRoll: prev.lastDiceRoll
        };
      }
      
      return newGame;
    });
  }, []);

  const saveSession = (gameId, player) => {
    localStorage.setItem('monopoly_gameId', gameId);
    localStorage.setItem('monopoly_playerId', player.id);
    localStorage.setItem('monopoly_playerName', player.name);
  };

  const clearSession = () => {
    localStorage.removeItem('monopoly_gameId');
    localStorage.removeItem('monopoly_playerId');
  };

  const getSavedSession = () => {
    const gameId = localStorage.getItem('monopoly_gameId');
    const playerId = localStorage.getItem('monopoly_playerId');
    return gameId && playerId ? { gameId, playerId } : null;
  };

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    currentPlayerRef.current = currentPlayer;
  }, [currentPlayer]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);

      const session = getSavedSession();
      const savedName = localStorage.getItem('monopoly_playerName');
      console.log('[CLIENT] Checking for saved session:', { session, savedName, currentGame });
      if (session && !currentGame) {
        console.log('[CLIENT] Attempting to rejoin game:', session.gameId);
        setRejoining(true);
        newSocket.emit('rejoinGame', { gameId: session.gameId, playerId: session.playerId, playerName: savedName });
      } else {
        console.log('[CLIENT] Not rejoining:', session ? 'already in game' : 'no saved session');
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    newSocket.on('error', (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 3000);
    });

    newSocket.on('gamesUpdated', (updatedGames) => {
      setGames(updatedGames);
    });

    newSocket.on('gameCreated', ({ gameId, player, game }) => {
      setCurrentGame(gameId);
      setCurrentPlayer(player);
      setGameState(game);
      saveSession(gameId, player);
    });

    newSocket.on('gameJoined', ({ gameId, player, game }) => {
      setCurrentGame(gameId);
      setCurrentPlayer(player);
      setGameState(game);
      saveSession(gameId, player);
    });

    newSocket.on('gameRejoined', ({ game }) => {
      const session = getSavedSession();
      if (session) {
        setCurrentGame(session.gameId);
        const player = game.players.find(p => p.id === newSocket.id);
        setCurrentPlayer(player);
        setGameState(game);
      }
      setRejoining(false);
    });

    newSocket.on('rejoinFailed', () => {
      clearSession();
      setRejoining(false);
    });

    newSocket.on('playerJoined', ({ player, game }) => {
      setGameState(game);
    });

    newSocket.on('playerLeft', ({ playerId, game }) => {
      setGameState(game);
    });

    newSocket.on('playerDisconnected', ({ playerId, game }) => {
      setGameState(game);
    });

    newSocket.on('playerReconnected', ({ playerId, game }) => {
      setGameState(game);
    });

    newSocket.on('gameStarted', ({ game }) => {
      setGameState(game);
      sounds.turnStart();
    });

    // Track pending landing result and animation state
    let pendingLandingResult = null;
    let isAnimating = false;

    const animatePlayerSteps = (playerId, startPos, steps, direction, options = {}) => new Promise(resolve => {
      if (steps <= 0) {
        resolve();
        return;
      }

      const { playStepSound = true, playLandingSound = false } = options;

      setAnimatingPlayer({ id: playerId, position: startPos });
      let currentStep = 0;

      const moveInterval = setInterval(() => {
        currentStep += 1;
        const newPos = (startPos + (currentStep * direction) + 40) % 40;
        setAnimatingPlayer({ id: playerId, position: newPos });
        if (playStepSound) {
          sounds.move();
        }

        if (currentStep >= steps) {
          clearInterval(moveInterval);
          setTimeout(() => {
            setAnimatingPlayer(null);
            if (playLandingSound) {
              sounds.diceResult();
            }
            resolve();
          }, 150);
        }
      }, 200);
    });

    const getForcedMoveDetails = (result, currentState, game) => {
      const movingPlayer = game.players[game.currentPlayerIndex];
      if (!movingPlayer || !currentState) return null;

      const startPlayer = currentState.players.find(p => p.id === movingPlayer.id);
      if (!startPlayer) return null;

      const startPos = startPlayer.position;
      const endPos = movingPlayer.position;
      const cardAction = result.card?.action;

      if (result.action === 'goToJail' || cardAction === 'jail') {
        const steps = (startPos - 10 + 40) % 40;
        return steps > 0 ? { playerId: movingPlayer.id, startPos, steps, direction: -1 } : null;
      }

      if (cardAction === 'moveBack') {
        return result.card?.spaces > 0
          ? { playerId: movingPlayer.id, startPos, steps: result.card.spaces, direction: -1 }
          : null;
      }

      if (cardAction === 'move' || cardAction === 'nearestRailroad' || cardAction === 'nearestUtility') {
        const steps = (endPos - startPos + 40) % 40;
        return steps > 0 ? { playerId: movingPlayer.id, startPos, steps, direction: 1 } : null;
      }

      return null;
    };

    const processLandingResult = (result, game) => {
      console.log('[CLIENT] Processing landing result:', result);
      setGameState(prev => {
        // Prevent stale state from overwriting newer state (e.g. if turn ended during animation)
        if (prev && prev.currentPlayerIndex !== game.currentPlayerIndex) {
          console.log('[CLIENT] Skipping stale state update from landing result');
          return prev;
        }
        
        // Preserve lastDiceRoll object if values match
        if (prev && prev.lastDiceRoll && game.lastDiceRoll &&
            prev.lastDiceRoll.die1 === game.lastDiceRoll.die1 &&
            prev.lastDiceRoll.die2 === game.lastDiceRoll.die2 &&
            prev.lastDiceRoll.total === game.lastDiceRoll.total) {
           return { ...game, lastDiceRoll: prev.lastDiceRoll };
        }
        
        return game;
      });

      if (result.action === 'paidRent') {
        sounds.payRent();
        setEventToast({ type: 'rent', title: 'Rent Paid!', message: `Paid £${result.rent} rent`, position: result.position });
        setTimeout(() => setEventToast(null), 3000);
      } else if (result.action === 'noRentJail') {
        setEventToast({
          type: 'info',
          title: 'No Rent',
          message: `${result.ownerName || 'Owner'} is in jail - no rent due`
        });
        setTimeout(() => setEventToast(null), 3000);
      } else if (result.action === 'paidTax') {

        sounds.payMoney();
        setEventToast({ type: 'tax', title: 'Tax Paid!', message: `Paid £${result.amount}` });
        setTimeout(() => setEventToast(null), 3000);
      } else if (result.action === 'goToJail') {
        sounds.jail();
        setEventToast({ type: 'jail', title: 'Go to Jail!', message: 'Do not pass GO, do not collect £200' });
        setTimeout(() => setEventToast(null), 3000);
      } else if (result.action === 'freeParking') {
        sounds.collectMoney();
        setEventToast({ type: 'money', title: 'Free Parking!', message: `Collected £${result.amount}` });
        setTimeout(() => setEventToast(null), 3000);
      } else if (result.type === 'chance') {
        sounds.card();
        setCurrentCard({ type: 'chance', text: result.card?.text || 'Chance card drawn', fading: false });
        setTimeout(() => setCurrentCard(prev => prev ? { ...prev, fading: true } : null), 3000);
        setTimeout(() => setCurrentCard(null), 3500);
      } else if (result.type === 'community-chest') {
        sounds.card();
        setCurrentCard({ type: 'community-chest', text: result.card?.text || 'Community Chest card drawn', fading: false });
        setTimeout(() => setCurrentCard(prev => prev ? { ...prev, fading: true } : null), 3000);
        setTimeout(() => setCurrentCard(null), 3500);
      }
    };

    const handleLandingResult = (result, game) => {
      const currentState = gameStateRef.current;
      const forcedMove = getForcedMoveDetails(result, currentState, game);
      const isCardMove = ['move', 'moveBack', 'nearestRailroad', 'nearestUtility', 'jail'].includes(result.card?.action);
      const isJailMove = result.action === 'goToJail' || result.card?.action === 'jail';

      if (!forcedMove || isJailMove || isCardMove) {
        processLandingResult(result, game);
        return;
      }

      // Keep the moving player at their original position while animating
      setGameState(prev => {
        if (!prev) return prev;
        const updatedPlayers = game.players.map(p =>
          p.id === forcedMove.playerId ? { ...p, position: forcedMove.startPos } : p
        );
        
        let rollToUse = game.lastDiceRoll;
        // Preserve lastDiceRoll object if values match
        if (prev.lastDiceRoll && game.lastDiceRoll &&
            prev.lastDiceRoll.die1 === game.lastDiceRoll.die1 &&
            prev.lastDiceRoll.die2 === game.lastDiceRoll.die2 &&
            prev.lastDiceRoll.total === game.lastDiceRoll.total) {
           rollToUse = prev.lastDiceRoll;
        }

        return { ...game, players: updatedPlayers, lastDiceRoll: rollToUse };
      });

      isAnimating = true;
      animatePlayerSteps(forcedMove.playerId, forcedMove.startPos, forcedMove.steps, forcedMove.direction, {
        playStepSound: false,
        playLandingSound: true
      })
        .then(() => {
          isAnimating = false;
          processLandingResult(result, game);
        });
    };

    newSocket.on('diceRolled', ({ result, game }) => {
      sounds.diceRoll();

      const movingPlayer = game.players[game.currentPlayerIndex];
      const newPosition = movingPlayer.position;

      // Check if player is in jail and didn't escape (no movement should happen)
      const playerStillInJail = movingPlayer.inJail;

      if (playerStillInJail) {
        // Player failed to roll doubles in jail - no animation needed, just show dice
        console.log('[CLIENT] Player still in jail, no movement animation');
        setGameState(prev => ({
          ...game,
          lastDiceRoll: result,
          diceRolled: true,
          pendingAction: prev?.pendingAction || game.pendingAction
        }));
        setTimeout(() => sounds.diceResult(), 500);
        return;
      }

      isAnimating = true;
      pendingLandingResult = null;
      const startPos = (newPosition - result.total + 40) % 40;

      // Update game state but KEEP the old position for the moving player
      setGameState(prev => {
        const updatedPlayers = game.players.map((p, idx) => {
          if (idx === game.currentPlayerIndex) {
            // Keep the OLD position during animation
            return { ...p, position: startPos };
          }
          return p;
        });
        return {
          ...game,
          players: updatedPlayers,
          lastDiceRoll: result,
          diceRolled: true,
          pendingAction: prev?.pendingAction || game.pendingAction
        };
      });

      // Wait for dice sound to finish, then start movement
      setTimeout(() => {
        sounds.diceResult();
        if (result.isDoubles) {
          setTimeout(() => sounds.doubles(), 200);
        }

      // Start movement animation after dice result shown
      setTimeout(() => {
        const steps = result.total;

        if (steps > 0) {
          setAnimatingPlayer({ id: movingPlayer.id, position: startPos });
          let currentStep = 0;
          const moveInterval = setInterval(() => {
            currentStep++;
            const newPos = (startPos + currentStep) % 40;
            setAnimatingPlayer({ id: movingPlayer.id, position: newPos });
            
            // Check for passing GO
            if (newPos === 0) {
              sounds.collectMoney();
              setEventToast({ type: 'money', title: 'Passed GO!', message: 'Collected £200' });
              setTimeout(() => setEventToast(null), 3000);
            }

            sounds.move();

            if (currentStep >= steps) {
              clearInterval(moveInterval);
              // Animation complete - update to final position
              setTimeout(() => {
                setAnimatingPlayer(null);
                isAnimating = false;

                // Update player to final position
                setGameState(prev => {
                  if (!prev) return prev;
                  const updatedPlayers = prev.players.map((p, idx) => {
                    if (idx === game.currentPlayerIndex) {
                      return { ...p, position: newPosition };
                    }
                    return p;
                  });
                  return { ...prev, players: updatedPlayers };
                });

                // Process any pending landing result
                if (pendingLandingResult) {
                  const queuedLandingResult = pendingLandingResult;
                  pendingLandingResult = null;
                  setTimeout(() => {
                    handleLandingResult(queuedLandingResult.result, queuedLandingResult.game);
                  }, 100);
                }

              }, 150);
            }
          }, 200);
        } else {
          isAnimating = false;
        }
      }, 400);

      }, 500);
    });

    newSocket.on('landingResult', ({ result, game }) => {
      console.log('[CLIENT] Landing result received, isAnimating:', isAnimating);
      if (isAnimating) {
        // Queue the landing result to process after animation
        pendingLandingResult = { result, game };
        console.log('[CLIENT] Queued landing result for after animation');
      } else {
        // Process immediately if not animating
        handleLandingResult(result, game);
      }
    });

    newSocket.on('propertyBought', ({ result, game }) => {
      console.log('[CLIENT] propertyBought received - currentPlayerIndex:', game.currentPlayerIndex);
      updateGameStateSafely(game);
      sounds.buyProperty();
    });

    newSocket.on('auctionStarted', ({ auction, game }) => {
      updateGameStateSafely(game);
      sounds.auction();
    });

    newSocket.on('auctionUpdate', ({ auction, game }) => {
      updateGameStateSafely(game);
      if (auction?.highestBidder) sounds.bid();
    });

    newSocket.on('auctionEnded', ({ winner, property, amount }) => {
      const propertyName = property?.name || 'property';
      if (winner) {
        sounds.auctionWin();
        setEventToast({
          type: 'auction',
          title: 'Auction Won',
          message: `${winner.name} won ${propertyName} for £${amount}`
        });
      } else {
        setEventToast({
          type: 'auction',
          title: 'Auction Ended',
          message: `No one bought ${propertyName}`
        });
      }
      setTimeout(() => setEventToast(null), 3000);
    });

    newSocket.on('houseBuilt', ({ result, game }) => {
      updateGameStateSafely(game);
      sounds.buildHouse();
    });

    newSocket.on('houseSold', ({ result, game }) => {
      updateGameStateSafely(game);
      sounds.sellHouse();
    });

    newSocket.on('propertyMortgaged', ({ result, game }) => {
      updateGameStateSafely(game);
      sounds.mortgage();
    });

    newSocket.on('propertyUnmortgaged', ({ result, game }) => {
      updateGameStateSafely(game);
      sounds.unmortgage();
    });

    newSocket.on('tradeProposed', ({ trade, game }) => {
      updateGameStateSafely(game);
      sounds.trade();
    });

    newSocket.on('tradeCompleted', ({ result, game }) => {
      updateGameStateSafely(game);
      sounds.tradeAccept();
    });

    newSocket.on('tradeDeclined', ({ tradeId, game }) => {
      updateGameStateSafely(game);
      sounds.tradeDecline();
    });

    newSocket.on('jailFinePaid', ({ result, game }) => {
      updateGameStateSafely(game);
      sounds.jailFree();
    });

    newSocket.on('jailCardUsed', ({ result, game }) => {
      updateGameStateSafely(game);
      sounds.jailFree();
    });

    newSocket.on('turnEnded', ({ game }) => {
      console.log('[CLIENT] turnEnded received - currentPlayerIndex:', game.currentPlayerIndex, 'player:', game.players[game.currentPlayerIndex]?.name);
      updateGameStateSafely(game);
      sounds.turnStart();
    });

    newSocket.on('propertyDeclined', ({ game }) => {
      console.log('[CLIENT] propertyDeclined received - currentPlayerIndex:', game.currentPlayerIndex);
      updateGameStateSafely(game);
    });

    newSocket.on('playerBankrupt', ({ result, game }) => {
      updateGameStateSafely(game);
      sounds.bankrupt();
    });

    newSocket.on('gameOver', ({ winner, game }) => {
      updateGameStateSafely(game);
      sounds.win();
    });

    setSocket(newSocket);

    fetch(`${SOCKET_URL}/api/games`)
      .then(res => res.json())
      .then(data => setGames(data))
      .catch(err => console.error('Failed to fetch games:', err));

    return () => {
      newSocket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createGame = useCallback((gameName, maxPlayers, isPrivate, auctionsEnabled, tokenId, colorId) => {
    if (!socket || !playerName.trim()) return;
    socket.emit('createGame', {
      playerName: playerName.trim(),
      gameName,
      maxPlayers,
      isPrivate,
      auctionsEnabled,
      tokenId,
      colorId
    });
  }, [socket, playerName]);

  const joinGame = useCallback((gameId, tokenId, colorId) => {
    if (!socket || !playerName.trim()) return;
    socket.emit('joinGame', {
      gameId,
      playerName: playerName.trim(),
      tokenId,
      colorId
    });
  }, [socket, playerName]);

  const startGame = useCallback(() => {
    if (!socket || !currentGame) return;
    socket.emit('startGame', { gameId: currentGame });
  }, [socket, currentGame]);

  const leaveGame = useCallback(() => {
    if (!socket || !currentGame) return;
    socket.emit('leaveGame', { gameId: currentGame });
    setCurrentGame(null);
    setCurrentPlayer(null);
    setGameState(null);
    clearSession();
  }, [socket, currentGame]);

  const addBot = useCallback((difficulty = 'hard') => {
    if (!socket || !currentGame) return;
    socket.emit('addBot', { gameId: currentGame, difficulty });
  }, [socket, currentGame]);

  const rollDice = useCallback(() => {
    if (!socket || !currentGame) return;
    socket.emit('rollDice', { gameId: currentGame });
  }, [socket, currentGame]);

  const buyProperty = useCallback(() => {
    if (!socket || !currentGame) return;
    socket.emit('buyProperty', { gameId: currentGame });
  }, [socket, currentGame]);

  const declineProperty = useCallback(() => {
    if (!socket || !currentGame) return;
    socket.emit('declineProperty', { gameId: currentGame });
  }, [socket, currentGame]);

  const placeBid = useCallback((amount) => {
    if (!socket || !currentGame) return;
    socket.emit('auctionBid', { gameId: currentGame, amount });
  }, [socket, currentGame]);

  const passBid = useCallback(() => {
    if (!socket || !currentGame) return;
    socket.emit('auctionPass', { gameId: currentGame });
  }, [socket, currentGame]);

  const buildHouse = useCallback((propertyIndex) => {
    if (!socket || !currentGame) return;
    socket.emit('buildHouse', { gameId: currentGame, propertyIndex });
  }, [socket, currentGame]);

  const sellHouse = useCallback((propertyIndex) => {
    if (!socket || !currentGame) return;
    socket.emit('sellHouse', { gameId: currentGame, propertyIndex });
  }, [socket, currentGame]);

  const mortgageProperty = useCallback((propertyIndex) => {
    if (!socket || !currentGame) return;
    socket.emit('mortgageProperty', { gameId: currentGame, propertyIndex });
  }, [socket, currentGame]);

  const unmortgageProperty = useCallback((propertyIndex) => {
    if (!socket || !currentGame) return;
    socket.emit('unmortgageProperty', { gameId: currentGame, propertyIndex });
  }, [socket, currentGame]);

  const proposeTrade = useCallback((targetPlayerId, offer, request) => {
    if (!socket || !currentGame) return;
    socket.emit('proposeTrade', { gameId: currentGame, targetPlayerId, offer, request });
  }, [socket, currentGame]);

  const acceptTrade = useCallback((tradeId) => {
    if (!socket || !currentGame) return;
    socket.emit('acceptTrade', { gameId: currentGame, tradeId });
  }, [socket, currentGame]);

  const declineTrade = useCallback((tradeId) => {
    if (!socket || !currentGame) return;
    socket.emit('declineTrade', { gameId: currentGame, tradeId });
  }, [socket, currentGame]);

  const payJailFine = useCallback(() => {
    if (!socket || !currentGame) return;
    socket.emit('payJailFine', { gameId: currentGame });
  }, [socket, currentGame]);

  const useJailCard = useCallback(() => {
    if (!socket || !currentGame) return;
    socket.emit('useJailCard', { gameId: currentGame });
  }, [socket, currentGame]);

  const endTurn = useCallback(() => {
    if (!socket || !currentGame) return;
    socket.emit('endTurn', { gameId: currentGame });
  }, [socket, currentGame]);

  const declareBankruptcy = useCallback(() => {
    if (!socket || !currentGame) return;
    socket.emit('declareBankruptcy', { gameId: currentGame });
  }, [socket, currentGame]);

  const resetAllGames = useCallback(async () => {
    const response = await fetch(`${SOCKET_URL}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      throw new Error('Reset failed');
    }
    // Clear local session
    clearSession();
    setGames([]);
    return response.json();
  }, []);

  if (!connected) {
    return (
      <div className="app loading">
        <div className="loading-spinner"></div>
        <p>Connecting to server...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {error && <div className="error-toast">{error}</div>}

      {!currentGame ? (
        <Lobby
          playerName={playerName}
          setPlayerName={setPlayerName}
          games={games}
          createGame={createGame}
          joinGame={joinGame}
          onReset={resetAllGames}
          socket={socket}
        />
      ) : (
        <GameBoard
          gameState={gameState}
          currentPlayer={currentPlayer}
          socket={socket}
          startGame={startGame}
          leaveGame={leaveGame}
          addBot={addBot}
          rollDice={rollDice}
          buyProperty={buyProperty}
          declineProperty={declineProperty}
          placeBid={placeBid}
          passBid={passBid}
          buildHouse={buildHouse}
          sellHouse={sellHouse}
          mortgageProperty={mortgageProperty}
          unmortgageProperty={unmortgageProperty}
          proposeTrade={proposeTrade}
          acceptTrade={acceptTrade}
          declineTrade={declineTrade}
          payJailFine={payJailFine}
          currentCard={currentCard}
          dismissCard={() => setCurrentCard(null)}
          eventToast={eventToast}
          animatingPlayer={animatingPlayer}
          useJailCard={useJailCard}
          endTurn={endTurn}
          declareBankruptcy={declareBankruptcy}
        />
      )}
    </div>
  );
}

export default App;
