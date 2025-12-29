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
  unmortgageProperty
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

  return (
    <div className="properties-panel">
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
                      className="btn btn-secondary btn-small"
                      onClick={() => buildHouse(property.index)}
                      disabled={!canBuildOnProperty(property)}
                      title={`Build house ($${property.houseCost})`}
                    >
                      +🏠
                    </button>
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => sellHouse(property.index)}
                      disabled={!canSellHouse(property)}
                      title={`Sell house ($${property.houseCost / 2})`}
                    >
                      -🏠
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
