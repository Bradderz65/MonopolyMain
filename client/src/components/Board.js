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

function Board({ board, players, onSpaceClick, animatingPlayer, followMode, followPosition, eventToast, freeParking, currentCard, onCardDeckClick }) {
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
        return <div className="space-name">FREE PARKING</div>;
      }
      if (space.type === 'go-to-jail') {
        return <div className="space-name">GO TO JAIL</div>;
      }
      if (space.type === 'chance') {
        return <div className="space-name space-icon">❓</div>;
      }
      if (space.type === 'community-chest') {
        return <div className="space-name space-icon">📦</div>;
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
        className={`board-space ${isCorner ? 'corner' : ''}`}
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
              borderRightColor: owner.color,
              '--owner-color': owner.color
            }}
            title={`Owned by ${owner.name}`}
          >
            <span className="owner-dot" style={{ background: owner.color }}></span>
          </div>
        )}
        {playersOnSpace.length > 0 && (
          <div className={`space-players ${playersOnSpace.length > 1 ? 'crowded' : ''}`}>
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
    // Extract just the amount from the message
    const amount = eventToast.message?.match(/£(\d+)/)?.[0] || eventToast.message;

    return (
      <div
        className="rent-popup-on-board"
        style={{
          gridColumn: gridPos.gridColumn,
          gridRow: gridPos.gridRow,
        }}
      >
        <div className="rent-float">
          <span className="rent-amount">{amount}</span>
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
          <p>🏠 Houses: {board.housesAvailable || 32}</p>
          <p>🏨 Hotels: {board.hotelsAvailable || 12}</p>
          <p className="free-parking-display">
            🅿️ Free Parking: <span className="free-parking-amount">£{freeParking || 0}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Board;
