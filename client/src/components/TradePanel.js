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
    <div className="trade-card" style={{ marginTop: 15 }}>
      <h4 style={{ marginBottom: 15 }}>Propose Trade</h4>
      
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

      <div style={{ display: 'flex', gap: 15, marginTop: 15 }}>
        <div style={{ flex: 1 }}>
          <h5 style={{ fontSize: '0.85rem', marginBottom: 10, color: '#4ecdc4' }}>You Offer:</h5>
          <div className="form-group">
            <label style={{ fontSize: '0.8rem' }}>Money:</label>
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
              style={{ padding: '8px', fontSize: '0.85rem' }}
            />
          </div>
          <div style={{ fontSize: '0.8rem', marginBottom: 5 }}>Properties:</div>
          <div style={{ maxHeight: 120, overflowY: 'auto' }}>
            {myPlayer?.properties.filter(p => !p.houses).map(prop => (
              <label 
                key={prop.index} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8, 
                  padding: '4px 0',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                <input
                  type="checkbox"
                  checked={offerProperties.includes(prop.index)}
                  onChange={() => toggleOfferProperty(prop.index)}
                />
                {prop.name}
              </label>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h5 style={{ fontSize: '0.85rem', marginBottom: 10, color: '#e74c3c' }}>You Want:</h5>
          <div className="form-group">
            <label style={{ fontSize: '0.8rem' }}>Money:</label>
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
              style={{ padding: '8px', fontSize: '0.85rem' }}
            />
          </div>
          <div style={{ fontSize: '0.8rem', marginBottom: 5 }}>Properties:</div>
          <div style={{ maxHeight: 120, overflowY: 'auto' }}>
            {selectedPlayer?.properties.filter(p => !p.houses).map(prop => (
              <label 
                key={prop.index} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8, 
                  padding: '4px 0',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                <input
                  type="checkbox"
                  checked={requestProperties.includes(prop.index)}
                  onChange={() => toggleRequestProperty(prop.index)}
                />
                {prop.name}
              </label>
            ))}
            {!selectedPlayer && (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                Select a player first
              </p>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
        <button 
          className="btn btn-primary" 
          onClick={handleProposeTrade}
          disabled={!targetPlayer}
          style={{ flex: 1 }}
        >
          Propose Trade
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={onClose}
          style={{ flex: 1 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default TradePanel;
