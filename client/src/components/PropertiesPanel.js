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

function PropertiesPanel({
  myPlayer,
  board,
  buildHouse,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
  isMyTurn
}) {
  if (!myPlayer || myPlayer.properties.length === 0) {
    return (
      <div className="properties-panel">
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: 20 }}>
          You don't own any properties yet.
        </p>
      </div>
    );
  }

  const groupedProperties = {};
  myPlayer.properties.forEach(prop => {
    const group = prop.color || prop.type;
    if (!groupedProperties[group]) {
      groupedProperties[group] = [];
    }
    groupedProperties[group].push(prop);
  });

  const canBuildOnProperty = (property) => {
    if (!isMyTurn) return false; // Can only build on your turn
    if (property.type !== 'property') return false;
    if (property.mortgaged) return false;
    if (property.houses >= 5) return false;

    const colorGroup = board.filter(s => s.color === property.color);
    const ownsAll = colorGroup.every(s => s.owner === myPlayer.id);
    if (!ownsAll) return false;

    const minHouses = Math.min(...colorGroup.map(s => s.houses || 0));
    if ((property.houses || 0) > minHouses) return false;

    if (myPlayer.money < property.houseCost) return false;

    return true;
  };

  const canSellHouse = (property) => {
    // Can sell if it's your turn OR you have debt to pay
    const hasDebt = myPlayer.debt && myPlayer.debt.amount > 0;
    if (!isMyTurn && !hasDebt) return false;

    if (property.type !== 'property') return false;
    if (!property.houses || property.houses === 0) return false;

    const colorGroup = board.filter(s => s.color === property.color);
    const maxHouses = Math.max(...colorGroup.map(s => s.houses || 0));
    if ((property.houses || 0) < maxHouses) return false;

    return true;
  };

  const renderHouses = (count) => {
    if (!count || count === 0) return null;
    if (count === 5) {
      return <span className="house-icon">🏨</span>;
    }
    return Array(count).fill(0).map((_, i) => (
      <span key={i} className="house-icon">🏠</span>
    ));
  };

  const hasDebt = myPlayer && myPlayer.debt && myPlayer.debt.amount > 0;

  return (
    <div className="properties-panel">
      {/* Show message when not your turn */}
      {!isMyTurn && !hasDebt && (
        <div style={{
          textAlign: 'center',
          color: 'rgba(255,255,255,0.6)',
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          marginBottom: '12px',
          fontSize: '0.85rem'
        }}>
          🔒 Building actions available on your turn
        </div>
      )}
      {!isMyTurn && hasDebt && (
        <div style={{
          textAlign: 'center',
          color: '#e74c3c',
          padding: '8px 12px',
          background: 'rgba(231, 76, 60, 0.1)',
          borderRadius: '8px',
          marginBottom: '12px',
          fontSize: '0.85rem',
          border: '1px solid rgba(231, 76, 60, 0.2)'
        }}>
          ⚠️ You can sell houses to pay your debt
        </div>
      )}
      {Object.entries(groupedProperties).map(([group, properties]) => (
        <div key={group} className="property-group">
          <div className="property-group-header">
            <div
              className="color-indicator"
              style={{ background: COLOR_MAP[group] || '#666' }}
            />
            <span>{group === 'railroad' ? 'Railroads' : group === 'utility' ? 'Utilities' : group}</span>
          </div>

          {properties.map(property => (
            <div
              key={property.index}
              className={`property-item ${property.mortgaged ? 'mortgaged' : ''}`}
            >
              <div>
                <div className="property-item-name">{property.name}</div>
                <div className="property-item-houses">
                  {renderHouses(property.houses)}
                </div>
              </div>
              <div className="property-item-actions">
                {property.type === 'property' && !property.mortgaged && (
                  <>
                    <button
                      className="btn btn-secondary btn-small build-house-btn"
                      onClick={() => buildHouse(property.index)}
                      disabled={!canBuildOnProperty(property)}
                      title={isMyTurn ? `Build house ($${property.houseCost})` : 'Wait for your turn'}
                    >
                      <span className="house-action-symbol">+</span>
                      <span className="house-action-icon" aria-hidden="true">🏠</span>
                    </button>
                    <button
                      className="btn btn-secondary btn-small sell-house-btn"
                      onClick={() => sellHouse(property.index)}
                      disabled={!canSellHouse(property)}
                      title={isMyTurn ? `Sell house ($${property.houseCost / 2})` : 'Wait for your turn'}
                    >
                      <span className="house-action-symbol">-</span>
                      <span className="house-action-icon" aria-hidden="true">🏠</span>
                    </button>
                  </>
                )}
                {!property.mortgaged ? (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => mortgageProperty(property.index)}
                    disabled={property.houses > 0}
                    title={`Mortgage ($${property.mortgage})`}
                  >
                    M
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => unmortgageProperty(property.index)}
                    disabled={myPlayer.money < Math.floor(property.mortgage * 1.1)}
                    title={`Unmortgage ($${Math.floor(property.mortgage * 1.1)})`}
                  >
                    U
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default PropertiesPanel;

