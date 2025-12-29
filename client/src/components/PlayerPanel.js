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

function PlayerPanel({ players, currentPlayerIndex, myPlayerId, board }) {
  const getPropertyColor = (prop) => {
    if (prop.type === 'railroad') return COLOR_MAP.railroad;
    if (prop.type === 'utility') return COLOR_MAP.utility;
    return COLOR_MAP[prop.color] || '#666';
  };

  return (
    <div className="players-panel">
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
