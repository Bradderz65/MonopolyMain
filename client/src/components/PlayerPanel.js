import React from 'react';

const COLOR_MAP = {
  'brown': '#8B4513',
  'light-blue': '#87CEEB',
  'pink': '#FF69B4',
  'orange': '#FFA500',
  'red': '#FF0000',
  'yellow': '#FFFF00',
  'green': '#008000',
  'dark-blue': '#00008B',
  'railroad': '#333',
  'utility': '#999'
};

function PlayerPanel({
  players,
  currentPlayerIndex,
  myPlayerId,
  board,
  ownerDotScale,
  canDecreaseOwnerDotScale,
  canIncreaseOwnerDotScale,
  onDecreaseOwnerDotScale,
  onIncreaseOwnerDotScale
}) {
  const getPropertyColor = (prop) => {
    if (prop.type === 'railroad') return COLOR_MAP.railroad;
    if (prop.type === 'utility') return COLOR_MAP.utility;
    return COLOR_MAP[prop.color] || '#666';
  };

  const showOwnerDotControls = typeof onDecreaseOwnerDotScale === 'function' && typeof onIncreaseOwnerDotScale === 'function';
  const ownerDotLabel = ownerDotScale === 0 ? 'Off' : `${Math.round((ownerDotScale || 1) * 100)}%`;

  return (
    <div className="players-panel">
      {showOwnerDotControls && (
        <div className="owner-dot-controls">
          <span className="owner-dot-label">Owner dots</span>
          <div className="owner-dot-buttons">
            <button
              className="btn btn-secondary btn-small owner-dot-button"
              onClick={onDecreaseOwnerDotScale}
              disabled={!canDecreaseOwnerDotScale}
              aria-label="Decrease owner dot size"
            >
              -
            </button>
            <button
              className="btn btn-secondary btn-small owner-dot-button"
              onClick={onIncreaseOwnerDotScale}
              disabled={!canIncreaseOwnerDotScale}
              aria-label="Increase owner dot size"
            >
              +
            </button>
          </div>
          <span className="owner-dot-size">{ownerDotLabel}</span>
        </div>
      )}
      {players.map((player, index) => (
        <div
          key={player.id}
          className={`player-card ${index === currentPlayerIndex ? 'current-turn' : ''} ${player.bankrupt ? 'bankrupt' : ''}`}
          style={{ borderLeftColor: player.color }}
        >
          <div className="player-card-header">
            <span className="player-token">{player.token}</span>
            <div className="player-details">
              <div className="player-name">
                {player.name}
                {player.id === myPlayerId && ' (You)'}
              </div>
              <div className="player-money">£{player.money.toLocaleString()}</div>
            </div>
            {player.inJail && <span className="player-status in-jail">In Jail</span>}
            {player.disconnected && <span className="player-status disconnected">Offline</span>}
            {player.bankrupt && <span className="player-status">Bankrupt</span>}
            {index === currentPlayerIndex && !player.bankrupt && (
              <span className="player-status" style={{ background: '#4ecdc4' }}>Turn</span>
            )}
          </div>
          
          {player.properties.length > 0 && (
            <div className="player-properties">
              {player.properties.map((prop) => (
                <div
                  key={prop.index}
                  className={`property-dot ${prop.mortgaged ? 'mortgaged' : ''}`}
                  style={{ background: getPropertyColor(prop) }}
                  title={`${prop.name}${prop.houses ? ` (${prop.houses === 5 ? 'Hotel' : prop.houses + ' houses'})` : ''}`}
                />
              ))}
            </div>
          )}
          
          {player.getOutOfJailCards > 0 && (
            <div style={{ fontSize: '0.75rem', marginTop: 5, color: 'rgba(255,255,255,0.6)' }}>
              🎫 {player.getOutOfJailCards} Get Out of Jail card{player.getOutOfJailCards > 1 ? 's' : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default PlayerPanel;
