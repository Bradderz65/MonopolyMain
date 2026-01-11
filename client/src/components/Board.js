import React from 'react';

const BOARD_LAYOUT = {
  bottom: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  left: [11, 12, 13, 14, 15, 16, 17, 18, 19],
  top: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
  right: [31, 32, 33, 34, 35, 36, 37, 38, 39]
};

const COLOR_MAP = {
  'brown': '#8B4513',
  'light-blue': '#87CEEB',
  'pink': '#FF69B4',
  'orange': '#FFA500',
  'red': '#FF0000',
  'yellow': '#FFFF00',
  'green': '#008000',
  'dark-blue': '#00008B'
};

// Calculate board position coordinates for a space index
const getSpaceCoordinates = (spaceIndex) => {
  // Board is 11x11 grid, spaces are on the edges
  // Returns percentage position (0-100) for x and y
  if (spaceIndex >= 0 && spaceIndex <= 10) {
    // Bottom row (GO to Jail) - right to left
    return { x: 100 - (spaceIndex * 10), y: 100 };
  } else if (spaceIndex >= 11 && spaceIndex <= 19) {
    // Left column - bottom to top
    return { x: 0, y: 100 - ((spaceIndex - 10) * 10) };
  } else if (spaceIndex >= 20 && spaceIndex <= 30) {
    // Top row - left to right
    return { x: (spaceIndex - 20) * 10, y: 0 };
  } else if (spaceIndex >= 31 && spaceIndex <= 39) {
    // Right column - top to bottom
    return { x: 100, y: (spaceIndex - 30) * 10 };
  }
  return { x: 50, y: 50 }; // Center fallback
};

// Get grid position for a space index (for positioning popups)
const getGridPosition = (spaceIndex) => {
  if (spaceIndex >= 0 && spaceIndex <= 10) {
    // Bottom row
    const idx = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].indexOf(spaceIndex);
    return { gridColumn: idx + 1, gridRow: 11 };
  } else if (spaceIndex >= 11 && spaceIndex <= 19) {
    // Left column
    const idx = spaceIndex - 11;
    return { gridColumn: 1, gridRow: 10 - idx };
  } else if (spaceIndex >= 20 && spaceIndex <= 30) {
    // Top row
    const idx = spaceIndex - 20;
    return { gridColumn: idx + 1, gridRow: 1 };
  } else if (spaceIndex >= 31 && spaceIndex <= 39) {
    // Right column
    const idx = spaceIndex - 31;
    return { gridColumn: 11, gridRow: idx + 2 };
  }
  return { gridColumn: 6, gridRow: 6 };
};

// Consistent Parking Icon Component
const ParkingIcon = () => (
  <svg viewBox="0 0 100 100" className="space-icon-svg" style={{ width: '1em', height: '1em', verticalAlign: 'middle' }}>
    <rect x="5" y="5" width="90" height="90" rx="15" fill="#3498db" />
    <text x="50" y="80" fontSize="85" textAnchor="middle" fill="white" fontWeight="900" fontFamily="Arial, sans-serif">P</text>
  </svg>
);

function Board({ board, players, onSpaceClick, animatingPlayer, followMode, followPosition, eventToast, freeParking, housesAvailable, hotelsAvailable, currentCard, onCardDeckClick, ownerDotScale = 1 }) {
  const getPlayersOnSpace = (spaceIndex) => {
    return players.filter(p => {
      if (p.bankrupt) return false;
      // If this player is animating, use the animated position
      if (animatingPlayer && animatingPlayer.id === p.id) {
        return animatingPlayer.position === spaceIndex;
      }
      return p.position === spaceIndex;
    });
  };

  // Calculate transform for follow mode
  const getFollowTransform = () => {
    if (!followMode) return {};

    const coords = getSpaceCoordinates(followPosition);
    // Zoom to 2x and center on player position
    const scale = 2;
    // Translate to center the player position
    // We need to move the board so the player's position is in the center
    const translateX = 50 - coords.x;
    const translateY = 50 - coords.y;

    return {
      transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
      transformOrigin: 'center center'
    };
  };

  const renderSpace = (spaceIndex, position) => {
    const space = board[spaceIndex];
    const playersOnSpace = getPlayersOnSpace(spaceIndex);
    const isCorner = [0, 10, 20, 30].includes(spaceIndex);
    const owner = space.owner ? players.find(p => p.id === space.owner) : null;
    const isOwnableSpace = ['property', 'railroad', 'utility'].includes(space.type);
    const shouldShrinkPlayers = isOwnableSpace && playersOnSpace.length > 1;
    const playerScale = shouldShrinkPlayers
      ? Math.max(0.6, 1 - (playersOnSpace.length - 1) * 0.12)
      : 1;

    const getGridPosition = () => {
      if (position === 'bottom') {
        const idx = BOARD_LAYOUT.bottom.indexOf(spaceIndex);
        return { gridColumn: idx + 1, gridRow: 11 };
      }
      if (position === 'top') {
        const idx = BOARD_LAYOUT.top.indexOf(spaceIndex);
        return { gridColumn: idx + 1, gridRow: 1 };
      }
      if (position === 'left') {
        const idx = BOARD_LAYOUT.left.indexOf(spaceIndex);
        return { gridColumn: 1, gridRow: 10 - idx };
      }
      if (position === 'right') {
        const idx = BOARD_LAYOUT.right.indexOf(spaceIndex);
        return { gridColumn: 11, gridRow: idx + 2 };
      }
      return {};
    };

    const getSpaceContent = () => {
      if (space.type === 'go') {
        return (
          <>
            <div className="space-name">GO</div>
            <div className="space-price">Collect £200</div>
          </>
        );
      }
      if (space.type === 'jail') {
        return <div className="space-name">JAIL</div>;
      }
      if (space.type === 'free-parking') {
        return (
          <div className="space-name space-icon-stack">
            <span className="space-icon-emoji space-icon-parking" aria-hidden="true"><ParkingIcon /></span>
            <span className="space-icon-label">Free Parking</span>
          </div>
        );
      }
      if (space.type === 'go-to-jail') {
        return (
          <div className="space-name space-icon-stack">
            <span className="space-icon-label">GO TO JAIL</span>
            <span className="space-icon-emoji go-to-jail-hand" aria-hidden="true">👈</span>
          </div>
        );
      }
      if (space.type === 'chance') {
        return (
          <div className="space-name space-icon-stack">
            <span className="space-icon-emoji" aria-hidden="true">❓</span>
            <span className="space-icon-label">Chance</span>
          </div>
        );
      }
      if (space.type === 'community-chest') {
        return (
          <div className="space-name space-icon-stack">
            <span className="space-icon-emoji" aria-hidden="true">📦</span>
            <span className="space-icon-label community-chest-label">Community Chest</span>
          </div>
        );
      }
      if (space.type === 'tax') {
        return (
          <>
            <div className="space-name">{space.name}</div>
            <div className="space-price">£{space.amount}</div>
          </>
        );
      }
      if (space.type === 'railroad') {
        return (
          <>
            <div className="space-color-bar" style={{ background: '#333' }}></div>
            <div className="space-name">{space.name}</div>
            <div className="space-price">£{space.price}</div>
          </>
        );
      }
      if (space.type === 'utility') {
        return (
          <>
            <div className="space-color-bar" style={{ background: '#999' }}></div>
            <div className="space-name">{space.name}</div>
            <div className="space-price">£{space.price}</div>
          </>
        );
      }
      if (space.type === 'property') {
        return (
          <>
            <div className="space-color-bar" style={{ background: COLOR_MAP[space.color] }}></div>
            <div className="space-name">{space.name}</div>
            <div className="space-price">£{space.price}</div>
          </>
        );
      }
      return <div className="space-name">{space.name}</div>;
    };

    const renderHouses = () => {
      if (!space.houses || space.houses === 0) return null;
      if (space.houses === 5) {
        return (
          <div className="space-houses">
            <div className="hotel"></div>
          </div>
        );
      }
      return (
        <div className="space-houses">
          {Array(space.houses).fill(0).map((_, i) => (
            <div key={i} className="house"></div>
          ))}
        </div>
      );
    };

    return (
      <div
        key={spaceIndex}
        className={`board-space ${position} ${isCorner ? 'corner' : ''}`}
        style={getGridPosition()}
        onClick={() => onSpaceClick(spaceIndex)}
      >
        {getSpaceContent()}
        {renderHouses()}
        {space.mortgaged && <div className="space-mortgaged">M</div>}
        {owner && (
          <div
            className="space-owner-indicator"
            style={{
              '--owner-color': owner.color,
              '--owner-dot-scale': ownerDotScale
            }}
            title={`Owned by ${owner.name}`}
          />
        )}
        {playersOnSpace.length > 0 && (
          <div
            className={`space-players ${shouldShrinkPlayers ? 'crowded' : ''}`}
            style={{ '--player-piece-scale': playerScale }}
          >
            {playersOnSpace.map(player => (
              <span key={player.id} className="player-piece" title={player.name}>
                {player.token}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render rent popup positioned on the property - minimal floating design
  const renderRentPopup = () => {
    if (!eventToast || eventToast.type !== 'rent' || eventToast.position === undefined) {
      return null;
    }

    const gridPos = getGridPosition(eventToast.position);
    // Use the explicit amount if available, otherwise fallback
    const amountStr = eventToast.amount ? `£${eventToast.amount}` : (eventToast.message?.match(/£(\d+)/)?.[0] || eventToast.message);

    return (
      <div
        className="rent-popup-on-board"
        style={{
          gridColumn: gridPos.gridColumn,
          gridRow: gridPos.gridRow,
          zIndex: 100 // Ensure it's on top
        }}
      >
        <div className="rent-float">
           {eventToast.fromName && eventToast.toName && (
             <div className="rent-players" style={{ 
               fontSize: 'clamp(0.9rem, 1.5vw, 1.1rem)', 
               fontWeight: 'bold', 
               marginBottom: '4px',
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               gap: '4px',
               whiteSpace: 'nowrap',
               textShadow: '0 0 4px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,1)'
             }}>
               <span style={{color: eventToast.fromColor}}>{eventToast.fromName}</span>
               <span className="rent-arrow" style={{color: 'white', fontSize: '0.8em'}}>➜</span>
               <span style={{color: eventToast.toColor}}>{eventToast.toName}</span>
             </div>
           )}
          <span className="rent-amount">{amountStr}</span>
          <div className="rent-coins">
            <span className="coin">●</span>
            <span className="coin">●</span>
            <span className="coin">●</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`monopoly-board ${followMode ? 'follow-mode-active' : ''}`}
      style={getFollowTransform()}
    >
      {BOARD_LAYOUT.bottom.map(idx => renderSpace(idx, 'bottom'))}
      {BOARD_LAYOUT.left.map(idx => renderSpace(idx, 'left'))}
      {BOARD_LAYOUT.top.map(idx => renderSpace(idx, 'top'))}
      {BOARD_LAYOUT.right.map(idx => renderSpace(idx, 'right'))}

      {renderRentPopup()}

      <div className="board-center">
        <div className="center-logo">MONOPOLY</div>

        {/* Player Color Legend */}
        <div className="player-color-legend">
          {players.map((player) => (
            <div key={player.id} className="legend-item">
              <span className="legend-color" style={{ background: player.color }}></span>
              <span className="legend-name">{player.name}</span>
            </div>
          ))}
        </div>

        {/* Card Decks */}
        <div className="card-decks">
          <div
            className={`card-deck chance-deck ${currentCard?.type === 'chance' ? 'drawing' : ''}`}
            onClick={() => onCardDeckClick?.('chance')}
          >
            <div className="deck-stack">
              <div className="deck-card"></div>
              <div className="deck-card"></div>
              <div className="deck-card"></div>
            </div>
            <div className="deck-label">CHANCE</div>
            <div className="deck-icon">?</div>
          </div>

          <div
            className={`card-deck community-deck ${currentCard?.type === 'community-chest' ? 'drawing' : ''}`}
            onClick={() => onCardDeckClick?.('community-chest')}
          >
            <div className="deck-stack">
              <div className="deck-card"></div>
              <div className="deck-card"></div>
              <div className="deck-card"></div>
            </div>
            <div className="deck-label">COMMUNITY CHEST</div>
            <div className="deck-icon">📦</div>
          </div>
        </div>

        <div className="center-info">
          <p>🏠 Houses Left: {housesAvailable ?? 32}</p>
          <p>🏨 Hotels Left: {hotelsAvailable ?? 12}</p>
          <p className="free-parking-display">
            <span style={{marginRight: '5px', fontSize: '1.2em', verticalAlign: 'sub'}}><ParkingIcon /></span> Free Parking: <span className="free-parking-amount">£{freeParking || 0}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Board;
