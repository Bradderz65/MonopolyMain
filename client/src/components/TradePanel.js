import React, { useState } from 'react';

function TradePanel({ myPlayer, players, board, proposeTrade, onClose }) {
  const [targetPlayer, setTargetPlayer] = useState('');
  const [offerMoney, setOfferMoney] = useState('');
  const [requestMoney, setRequestMoney] = useState('');
  const [offerProperties, setOfferProperties] = useState([]);
  const [requestProperties, setRequestProperties] = useState([]);

  const otherPlayers = players.filter(p => p.id !== myPlayer?.id && !p.bankrupt);
  const selectedPlayer = players.find(p => p.id === targetPlayer);

  const toggleOfferProperty = (propIndex) => {
    setOfferProperties(prev => 
      prev.includes(propIndex) 
        ? prev.filter(p => p !== propIndex)
        : [...prev, propIndex]
    );
  };

  const toggleRequestProperty = (propIndex) => {
    setRequestProperties(prev => 
      prev.includes(propIndex) 
        ? prev.filter(p => p !== propIndex)
        : [...prev, propIndex]
    );
  };

  const handleProposeTrade = () => {
    if (!targetPlayer) return;
    
    const offerMoneyNum = offerMoney === '' ? 0 : parseInt(offerMoney) || 0;
    const requestMoneyNum = requestMoney === '' ? 0 : parseInt(requestMoney) || 0;
    
    const offer = {
      money: offerMoneyNum > 0 ? offerMoneyNum : undefined,
      properties: offerProperties.length > 0 ? offerProperties : undefined
    };
    
    const request = {
      money: requestMoneyNum > 0 ? requestMoneyNum : undefined,
      properties: requestProperties.length > 0 ? requestProperties : undefined
    };
    
    if (!offer.money && !offer.properties && !request.money && !request.properties) {
      alert('Please select something to trade');
      return;
    }
    
    proposeTrade(targetPlayer, offer, request);
    onClose();
  };

  return (
    <div className="action-card trade-card trade-panel">
      <div className="action-card-header">🤝 Propose Trade</div>
      <div className="action-card-body">
        <div className="form-group">
          <label>Trade with:</label>
          <select
            value={targetPlayer}
            onChange={(e) => {
              setTargetPlayer(e.target.value);
              setRequestProperties([]);
            }}
          >
            <option value="">Select player...</option>
            {otherPlayers.map(p => (
              <option key={p.id} value={p.id}>{p.token} {p.name}</option>
            ))}
          </select>
        </div>

        <div className="trade-content">
          <div className="trade-side offer">
            <h5 className="trade-side-title offer">You Offer</h5>
            <div className="form-group">
              <label>Money:</label>
              <input
                type="number"
                min="0"
                max={myPlayer?.money || 0}
                value={offerMoney}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setOfferMoney('');
                  } else {
                    const num = parseInt(value);
                    if (!isNaN(num) && num >= 0) {
                      setOfferMoney(value);
                    }
                  }
                }}
              />
            </div>
            <div className="trade-list-label">Properties</div>
            <div className="trade-property-list">
              {myPlayer?.properties.filter(p => !p.houses).map(prop => (
                <label key={prop.index} className="trade-property-option">
                  <input
                    type="checkbox"
                    checked={offerProperties.includes(prop.index)}
                    onChange={() => toggleOfferProperty(prop.index)}
                  />
                  <span className="trade-property-name">{prop.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="trade-side request">
            <h5 className="trade-side-title request">You Want</h5>
            <div className="form-group">
              <label>Money:</label>
              <input
                type="number"
                min="0"
                max={selectedPlayer?.money || 0}
                value={requestMoney}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setRequestMoney('');
                  } else {
                    const num = parseInt(value);
                    if (!isNaN(num) && num >= 0) {
                      setRequestMoney(value);
                    }
                  }
                }}
              />
            </div>
            <div className="trade-list-label">Properties</div>
            <div className="trade-property-list">
              {selectedPlayer?.properties.filter(p => !p.houses).map(prop => (
                <label key={prop.index} className="trade-property-option">
                  <input
                    type="checkbox"
                    checked={requestProperties.includes(prop.index)}
                    onChange={() => toggleRequestProperty(prop.index)}
                  />
                  <span className="trade-property-name">{prop.name}</span>
                </label>
              ))}
              {!selectedPlayer && (
                <div className="trade-empty">Select a player first</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="action-card-buttons">
        <button
          className="btn btn-primary"
          onClick={handleProposeTrade}
          disabled={!targetPlayer}
        >
          Propose Trade
        </button>
        <button
          className="btn btn-secondary"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default TradePanel;
