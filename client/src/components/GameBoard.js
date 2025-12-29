import React, { useState, useMemo, useRef } from 'react';
import Board from './Board';
import PlayerPanel from './PlayerPanel';
import ActionsPanel from './ActionsPanel';
import PropertiesPanel from './PropertiesPanel';
import GameLog from './GameLog';
// TradePanel is used in ActionsPanel

// Property color mapping for popup header
const PROPERTY_COLORS = {
  brown: '#8B4513',
  'light-blue': '#87CEEB',
  pink: '#FF69B4',
  orange: '#FFA500',
  red: '#FF0000',
  yellow: '#FFD700',
  green: '#228B22',
  'dark-blue': '#00008B'
};

function getPropertyColor(property) {
  if (!property) return '#4ecdc4';
  if (property.type === 'railroad') return '#555';
  if (property.type === 'utility') return '#8e44ad';
  if (property.color && PROPERTY_COLORS[property.color]) {
    return PROPERTY_COLORS[property.color];
  }
  return '#4ecdc4';
}

function GameBoard({
  gameState,
  currentPlayer,
  startGame,
  leaveGame,
  addBot,
  rollDice,
  buyProperty,
  declineProperty,
  placeBid,
  passBid,
  buildHouse,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
  proposeTrade,
  acceptTrade,
  declineTrade,
  payJailFine,
  useJailCard,
  endTurn,
  declareBankruptcy,
  currentCard,
  dismissCard,
  eventToast,
  animatingPlayer
}) {
  // Default to 'players' tab to show full player details
  const [activeTab, setActiveTab] = useState('players');
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [propertyPopupDismissed, setPropertyPopupDismissed] = useState(false);
  const [followMode, setFollowMode] = useState(false);
  const [logTabVisible, setLogTabVisible] = useState(false);

  // Swipe gesture refs
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const touchEndX = useRef(null);
  const touchEndY = useRef(null);

  // Triple tap detection refs
  const tapCount = useRef(0);
  const tapTimer = useRef(null);

  // Tab order for swipe navigation (log excluded from normal navigation)
  const visibleTabs = ['players', 'actions', 'properties'];
  // eslint-disable-next-line no-unused-vars
  const allTabs = ['players', 'actions', 'properties', 'log'];

  // Minimum swipe distance (in pixels)
  const minSwipeDistance = 50;

  // Triple tap detection (within 500ms)
  const TRIPLE_TAP_TIMEOUT = 500;

  const handleTripleTap = () => {
    // Clear existing timer
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
    }

    tapCount.current += 1;

    if (tapCount.current === 3) {
      // Triple tap detected!
      setLogTabVisible(true);
      setActiveTab('log');
      tapCount.current = 0;
      if (tapTimer.current) {
        clearTimeout(tapTimer.current);
        tapTimer.current = null;
      }
    } else {
      // Reset counter after timeout
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0;
        tapTimer.current = null;
      }, TRIPLE_TAP_TIMEOUT);
    }
  };

  const onTouchStart = (e) => {
    touchEndX.current = null;
    touchEndY.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const onTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;
  };

  const onTouchEnd = () => {
    if (!touchStartX.current) {
      touchStartX.current = null;
      touchStartY.current = null;
      touchEndX.current = null;
      touchEndY.current = null;
      return;
    }

    const distanceX = touchStartX.current - (touchEndX.current || touchStartX.current);
    const distanceY = touchStartY.current - (touchEndY.current || touchStartY.current);

    // Check if it's a tap (very small movement) or a swipe
    const isTap = Math.abs(distanceX) < 10 && Math.abs(distanceY) < 10;

    if (isTap) {
      // Treat as tap - check for triple tap
      handleTripleTap();
    } else {
      // Check for swipe
      const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY);
      const isLeftSwipe = distanceX > minSwipeDistance && isHorizontalSwipe;
      const isRightSwipe = distanceX < -minSwipeDistance && isHorizontalSwipe;

      if (isLeftSwipe || isRightSwipe) {
        // Use visibleTabs for navigation (excludes log)
        // If currently on log, switch to first visible tab
        const currentTab = activeTab === 'log' ? visibleTabs[0] : activeTab;
        const currentIndex = visibleTabs.indexOf(currentTab);
        let newIndex;

        if (isLeftSwipe && currentIndex < visibleTabs.length - 1) {
          // Swipe left - go to next tab
          newIndex = currentIndex + 1;
        } else if (isRightSwipe && currentIndex > 0) {
          // Swipe right - go to previous tab
          newIndex = currentIndex - 1;
        }

        if (newIndex !== undefined) {
          setActiveTab(visibleTabs[newIndex]);
        }
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;
  };

  // Handle click on swipe panel for triple tap (desktop/mouse)
  const onSwipePanelClick = () => {
    handleTripleTap();
  };

  // Reset popup dismissed state when pendingAction changes
  React.useEffect(() => {
    if (gameState?.pendingAction?.type === 'buyOrAuction') {
      setPropertyPopupDismissed(false);
    }
  }, [gameState?.pendingAction]);

  // Cleanup tap timer on unmount
  React.useEffect(() => {
    return () => {
      if (tapTimer.current) {
        clearTimeout(tapTimer.current);
      }
    };
  }, []);

  // Hide log tab when navigating to a different tab (for desktop tab clicks)
  React.useEffect(() => {
    if (activeTab !== 'log' && logTabVisible) {
      setLogTabVisible(false);
    }
  }, [activeTab, logTabVisible]);

  const myPlayer = useMemo(() => {
    if (!gameState || !currentPlayer) return null;
    return gameState.players.find(p => p.id === currentPlayer.id);
  }, [gameState, currentPlayer]);

  const isMyTurn = useMemo(() => {
    if (!gameState || !myPlayer) return false;
    return gameState.currentPlayerIndex === gameState.players.indexOf(myPlayer);
  }, [gameState, myPlayer]);

  // Get current active player position for follow mode (follows whoever's turn it is)
  // Follows animating player position for active tracking
  const followPosition = useMemo(() => {
    if (!gameState) return 0;

    // If animating, follow the animated position (active tracking)
    if (animatingPlayer) {
      return animatingPlayer.position;
    }

    // Follow the current active player (whoever's turn it is)
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (activePlayer) {
      return activePlayer.position;
    }

    // Fallback to my player
    return myPlayer?.position || 0;
  }, [gameState, myPlayer, animatingPlayer]);

  const winner = useMemo(() => {
    if (!gameState) return null;
    const activePlayers = gameState.players.filter(p => !p.bankrupt);
    if (activePlayers.length === 1 && gameState.started) {
      return activePlayers[0];
    }
    return null;
  }, [gameState]);

  if (!gameState) {
    return (
      <div className="game-container">
        <div className="app loading">
          <div className="loading-spinner"></div>
          <p>Loading game...</p>
        </div>
      </div>
    );
  }

  if (!gameState.started) {
    return (
      <div className="game-container">
        <div className="waiting-room">
          <h2>Waiting for Players</h2>
          <div className="game-code-display">{gameState.id}</div>
          <p>Share this code with friends to join!</p>

          <div className="players-waiting">
            <h3>Players ({gameState.players.length}/{gameState.maxPlayers || 4})</h3>
            {gameState.players.map((player, idx) => (
              <div key={player.id} className="player-badge" style={{ borderColor: player.color }}>
                <span className="player-token">{player.token}</span>
                <span className="player-name">{player.name}</span>
                {player.isHost && <span className="host-badge">HOST</span>}
              </div>
            ))}
          </div>

          <div className="waiting-actions">
            {myPlayer?.isHost && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={startGame}
                  disabled={gameState.players.length < 1}
                >
                  Start Game
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={addBot}
                  disabled={gameState.players.length >= (gameState.maxPlayers || 4)}
                >
                  🤖 Add Bot
                </button>
              </>
            )}
            <button className="btn btn-danger" onClick={leaveGame}>
              Leave Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      {winner && (
        <div className="game-over-overlay">
          <div className="game-over-modal">
            <h2>🏆 Game Over! 🏆</h2>
            <div className="winner-display">
              <div className="winner-token">{winner.token}</div>
              <div className="winner-name">{winner.name} Wins!</div>
            </div>
            <p>Final Money: £{winner.money.toLocaleString()}</p>
            <button className="btn btn-primary" onClick={leaveGame} style={{ marginTop: 20 }}>
              Return to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Property Purchase Popup */}
      {gameState.pendingAction?.type === 'buyOrAuction' && isMyTurn && myPlayer && !propertyPopupDismissed && (
        <div className="card-modal-overlay property-popup" onClick={() => setPropertyPopupDismissed(true)}>
          <div className="card-modal property-card" onClick={e => e.stopPropagation()}>
            <div
              className="card-modal-header property-header"
              style={{
                background: getPropertyColor(gameState.board[myPlayer.position]),
                color: gameState.board[myPlayer.position]?.color === 'yellow' ? '#000' : '#fff'
              }}
            >
              🏠 {gameState.board[myPlayer.position]?.name}
            </div>
            <div className="card-modal-body property-body">
              <div className="property-popup-price">£{gameState.board[myPlayer.position]?.price}</div>
              <div className="property-popup-money">You have: £{myPlayer.money}</div>
              {gameState.board[myPlayer.position]?.type === 'property' && gameState.board[myPlayer.position]?.rent && (
                <div className="property-popup-rent">Rent: £{gameState.board[myPlayer.position].rent[0]}</div>
              )}
            </div>
            <div className="property-popup-buttons">
              <button
                className="btn btn-success btn-popup"
                onClick={buyProperty}
                disabled={myPlayer.money < gameState.board[myPlayer.position]?.price}
              >
                ✓ Buy for £{gameState.board[myPlayer.position]?.price}
              </button>
              <button
                className="btn btn-danger btn-popup"
                onClick={declineProperty}
              >
                ✗ Don't Buy (Auction)
              </button>
              <button
                className="btn btn-secondary btn-popup"
                onClick={() => setPropertyPopupDismissed(true)}
              >
                ✕ Close (Decide Later)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Property Popup Button */}
      {gameState.pendingAction?.type === 'buyOrAuction' && isMyTurn && myPlayer && propertyPopupDismissed && (
        <div className="property-reopen-banner" onClick={() => setPropertyPopupDismissed(false)}>
          <span>🏠 Property Available: {gameState.board[myPlayer.position]?.name}</span>
          <button className="btn btn-primary btn-small">View Property</button>
        </div>
      )}

      {/* Show toast for non-rent events (rent is shown on the board) */}
      {eventToast && eventToast.type !== 'rent' && (
        <div className={`event-toast ${eventToast.type}`}>
          <div className="event-toast-title">{eventToast.title}</div>
          <div className="event-toast-message">{eventToast.message}</div>
        </div>
      )}

      <div className="game-header-minimal">
        {/* Left: Leave button and game title */}
        <div className="header-left">
          <button className="btn-leave" onClick={leaveGame}>✕</button>
          <span className="game-title">{gameState.name}</span>
        </div>

        {/* Right: Players summary */}
        <div className="header-right">
          <div className="players-inline">
            {gameState.players.map((player, idx) => (
              <div
                key={player.id}
                className={`player-chip ${idx === gameState.currentPlayerIndex ? 'active' : ''} ${player.bankrupt ? 'out' : ''}`}
                title={`${player.name}: £${player.money.toLocaleString()}${player.inJail ? ' (Jail)' : ''}`}
                style={{
                  '--player-color': player.color,
                  borderLeft: `3px solid ${player.color}`
                }}
              >
                <span className="chip-token">{player.token}</span>
                <span className="chip-money">£{player.money.toLocaleString()}</span>
                {player.inJail && <span className="chip-jail">🔒</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Community Chest and Chance Cards - displayed at top center under header */}
      {currentCard && (
        <div className={`card-display-top ${currentCard.type} ${currentCard.fading ? 'fading' : ''}`}>
          <div className="card-display-inner">
            <div className="card-display-header">
              {currentCard.type === 'chance' ? '❓ CHANCE' : '📦 COMMUNITY CHEST'}
            </div>
            <div className="card-display-text">{currentCard.text}</div>
          </div>
        </div>
      )}

      <div className="game-main">
        <div className={`board-container ${followMode ? 'follow-mode' : ''}`}>
          <Board
            board={gameState.board}
            players={gameState.players}
            onSpaceClick={setSelectedProperty}
            animatingPlayer={animatingPlayer}
            followMode={followMode}
            followPosition={followPosition}
            eventToast={eventToast}
            freeParking={gameState.freeParking}
            currentCard={currentCard}
          />
        </div>

        <div className="sidebar">
          <div className="sidebar-tabs desktop-only">
            <button
              className={`sidebar-tab players-tab ${activeTab === 'players' ? 'active' : ''}`}
              onClick={() => setActiveTab('players')}
            >
              <span className="tab-icon">👥</span>
              <span className="tab-label">Players</span>
            </button>
            <button
              className={`sidebar-tab ${activeTab === 'actions' ? 'active' : ''}`}
              onClick={() => setActiveTab('actions')}
            >
              <span className="tab-icon">🎲</span>
              <span className="tab-label">Actions</span>
            </button>
            <button
              className={`sidebar-tab ${activeTab === 'properties' ? 'active' : ''}`}
              onClick={() => setActiveTab('properties')}
            >
              <span className="tab-icon">🏠</span>
              <span className="tab-label">Properties</span>
            </button>
            {logTabVisible && (
              <button
                className={`sidebar-tab ${activeTab === 'log' ? 'active' : ''}`}
                onClick={() => setActiveTab('log')}
              >
                <span className="tab-icon">📋</span>
                <span className="tab-label">Log</span>
              </button>
            )}
          </div>

          {/* Mobile swipe indicator */}
          <div
            className="mobile-swipe-indicator"
            onClick={onSwipePanelClick}
          >
            <div className="swipe-dots">
              {visibleTabs.map((tab, index) => (
                <div
                  key={tab}
                  className={`swipe-dot ${activeTab === tab ? 'active' : ''}`}
                />
              ))}
            </div>
            <div className="swipe-hint">Swipe left/right to navigate</div>
          </div>

          <div
            className="sidebar-content swipeable"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {activeTab === 'players' && (
              <PlayerPanel
                players={gameState.players}
                currentPlayerIndex={gameState.currentPlayerIndex}
                myPlayerId={currentPlayer?.id}
                board={gameState.board}
              />
            )}
            {activeTab === 'actions' && (
              <ActionsPanel
                gameState={gameState}
                myPlayer={myPlayer}
                isMyTurn={isMyTurn}
                rollDice={rollDice}
                buyProperty={buyProperty}
                declineProperty={declineProperty}
                placeBid={placeBid}
                passBid={passBid}
                payJailFine={payJailFine}
                useJailCard={useJailCard}
                endTurn={endTurn}
                declareBankruptcy={declareBankruptcy}
                proposeTrade={proposeTrade}
                acceptTrade={acceptTrade}
                declineTrade={declineTrade}
                followMode={followMode}
                setFollowMode={setFollowMode}
              />
            )}
            {activeTab === 'properties' && (
              <PropertiesPanel
                myPlayer={myPlayer}
                board={gameState.board}
                buildHouse={buildHouse}
                sellHouse={sellHouse}
                mortgageProperty={mortgageProperty}
                unmortgageProperty={unmortgageProperty}
              />
            )}
            {activeTab === 'log' && logTabVisible && (
              <GameLog log={gameState.gameLog} />
            )}
          </div>
        </div>
      </div>

      {selectedProperty !== null && (
        <PropertyModal
          property={gameState.board[selectedProperty]}
          players={gameState.players}
          onClose={() => setSelectedProperty(null)}
        />
      )}
    </div>
  );
}

function PropertyModal({ property, players, onClose }) {
  if (!property) return null;

  const owner = property.owner ? players.find(p => p.id === property.owner) : null;

  const getColorClass = () => {
    if (property.type === 'railroad') return 'color-railroad';
    if (property.type === 'utility') return 'color-utility';
    if (property.color) return `color-${property.color}`;
    return '';
  };

  return (
    <div className="property-modal-overlay" onClick={onClose}>
      <div className="property-modal" onClick={e => e.stopPropagation()}>
        <div className={`property-modal-header ${getColorClass()}`} style={{ height: 60 }}>
          <div className="property-modal-name" style={{ color: property.color === 'yellow' ? '#000' : '#fff' }}>
            {property.name}
          </div>
        </div>
        <div className="property-modal-body">
          {property.type === 'property' && (
            <>
              <div className="property-modal-row">
                <span>Price:</span>
                <span>${property.price}</span>
              </div>
              <div className="property-modal-row">
                <span>Rent:</span>
                <span>${property.rent[0]}</span>
              </div>
              <div className="property-modal-row">
                <span>With 1 House:</span>
                <span>${property.rent[1]}</span>
              </div>
              <div className="property-modal-row">
                <span>With 2 Houses:</span>
                <span>${property.rent[2]}</span>
              </div>
              <div className="property-modal-row">
                <span>With 3 Houses:</span>
                <span>${property.rent[3]}</span>
              </div>
              <div className="property-modal-row">
                <span>With 4 Houses:</span>
                <span>${property.rent[4]}</span>
              </div>
              <div className="property-modal-row">
                <span>With Hotel:</span>
                <span>${property.rent[5]}</span>
              </div>
              <div className="property-modal-row">
                <span>House Cost:</span>
                <span>${property.houseCost}</span>
              </div>
              <div className="property-modal-row">
                <span>Mortgage Value:</span>
                <span>${property.mortgage}</span>
              </div>
            </>
          )}
          {property.type === 'railroad' && (
            <>
              <div className="property-modal-row">
                <span>Price:</span>
                <span>${property.price}</span>
              </div>
              <div className="property-modal-row">
                <span>Rent (1 RR):</span>
                <span>$25</span>
              </div>
              <div className="property-modal-row">
                <span>Rent (2 RR):</span>
                <span>$50</span>
              </div>
              <div className="property-modal-row">
                <span>Rent (3 RR):</span>
                <span>$100</span>
              </div>
              <div className="property-modal-row">
                <span>Rent (4 RR):</span>
                <span>$200</span>
              </div>
              <div className="property-modal-row">
                <span>Mortgage:</span>
                <span>${property.mortgage}</span>
              </div>
            </>
          )}
          {property.type === 'utility' && (
            <>
              <div className="property-modal-row">
                <span>Price:</span>
                <span>${property.price}</span>
              </div>
              <div className="property-modal-row">
                <span>If 1 owned:</span>
                <span>4x dice roll</span>
              </div>
              <div className="property-modal-row">
                <span>If 2 owned:</span>
                <span>10x dice roll</span>
              </div>
              <div className="property-modal-row">
                <span>Mortgage:</span>
                <span>${property.mortgage}</span>
              </div>
            </>
          )}
          {owner && (
            <div className="property-modal-row" style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10 }}>
              <span>Owner:</span>
              <span style={{ color: owner.color }}>{owner.token} {owner.name}</span>
            </div>
          )}
          {property.mortgaged && (
            <div className="property-modal-row">
              <span style={{ color: '#e74c3c' }}>MORTGAGED</span>
            </div>
          )}
          {property.houses > 0 && (
            <div className="property-modal-row">
              <span>Buildings:</span>
              <span>{property.houses === 5 ? '1 Hotel' : `${property.houses} House(s)`}</span>
            </div>
          )}
        </div>
        <div className="property-modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default GameBoard;
