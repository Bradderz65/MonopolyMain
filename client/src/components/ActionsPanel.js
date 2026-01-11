import React, { useEffect, useRef, useState } from 'react';
import TradePanel from './TradePanel';
import DiceDisplay from './DiceDisplay';

function ActionsPanel({
  gameState,
  myPlayer,
  isMyTurn,
  rollDice,
  buyProperty,
  declineProperty,
  placeBid,
  passBid,
  payJailFine,
  useJailCard,
  endTurn,
  declareBankruptcy,
  proposeTrade,
  acceptTrade,
  declineTrade,
  followMode,
  setFollowMode,
  animatingPlayer
}) {
  const [bidAmount, setBidAmount] = useState('');
  const [showTrade, setShowTrade] = useState(false);
  const [currentTradeIndex, setCurrentTradeIndex] = useState(0);
  const [rollPending, setRollPending] = useState(false);
  const [forceDiceAnimation, setForceDiceAnimation] = useState(false);
  const [autoEndTurn, setAutoEndTurn] = useState(() => localStorage.getItem('monopoly_autoEndTurn') === 'true');
  const [autoEndTimer, setAutoEndTimer] = useState(null);
  const lastRollRef = useRef(gameState.lastDiceRoll);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  // Ensure we can't end turn while animating
  const canEndTurn = isMyTurn && gameState.diceRolled && !gameState.canRollAgain && !gameState.pendingAction && !gameState.auction && !animatingPlayer;

  // Determine if roll button should be enabled
  const canRollDice = isMyTurn && !canEndTurn && (
    !gameState.diceRolled ||
    gameState.canRollAgain ||
    (myPlayer?.inJail && !gameState.diceRolled)
  );

  const isRollLocked = rollPending || !!animatingPlayer;

  const toggleAutoEndTurn = () => {
    const newValue = !autoEndTurn;
    setAutoEndTurn(newValue);
    localStorage.setItem('monopoly_autoEndTurn', newValue);
  };

  // Helper to check for buildable properties
  const canBuildHouses = () => {
    if (!myPlayer || !gameState.board) return false;
    
    // Group properties by color
    const propertiesByColor = {};
    gameState.board.forEach((space, index) => {
      if (space.type === 'property' && space.color) {
        if (!propertiesByColor[space.color]) propertiesByColor[space.color] = [];
        propertiesByColor[space.color].push({ ...space, index });
      }
    });

    // Check each color group
    for (const color in propertiesByColor) {
      const group = propertiesByColor[color];
      const ownsAll = group.every(p => p.owner === myPlayer.id);
      
      if (ownsAll) {
        // Check if any property in group can handle a house (simplified check for potential)
        const minHouses = Math.min(...group.map(p => p.houses || 0));
        // Also check if any property is mortgaged (cannot build if any in group is mortgaged)
        const anyMortgaged = group.some(p => p.mortgaged);
        
        if (!anyMortgaged && minHouses < 5) {
           // Check affordability
           const cost = group[0].houseCost;
           if (myPlayer.money >= cost) return true;
        }
      }
    }
    return false;
  };

  // Effect for Auto End Turn logic
  useEffect(() => {
    let timerId;
    
    if (canEndTurn && autoEndTurn) {
      // If player has potential to build houses, don't auto-end
      if (canBuildHouses()) {
        setAutoEndTimer(null); // Ensure timer is cleared if state changes to buildable
        return; 
      }

      // Start countdown
      let count = 3;
      setAutoEndTimer(count);
      timerId = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(timerId);
          setAutoEndTimer(null);
          // Only auto-end if still valid
          endTurn();
        } else {
          setAutoEndTimer(count);
        }
      }, 1000);
    } else {
      setAutoEndTimer(null);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEndTurn, autoEndTurn, gameState.stateVersion]); // monitoring stateVersion to retry check after actions

  const handleBid = () => {
    const amount = parseInt(bidAmount);
    if (amount && amount > (gameState.auction?.currentBid || 0)) {
      placeBid(amount);
      setBidAmount('');
    }
  };

  const handleRollDice = () => {
    if (isRollLocked) return;
    setRollPending(true);
    rollDice();
  };

  const quickBid = (increment) => {
    if (!gameState.auction || !myPlayer) return;
    const newBid = (gameState.auction?.currentBid || 0) + increment;
    placeBid(newBid);
  };

  useEffect(() => {
    // If the roll changed (new object ref), trigger animation
    if (gameState.lastDiceRoll !== lastRollRef.current) {
      setForceDiceAnimation(true);
      lastRollRef.current = gameState.lastDiceRoll;
      // Also clear pending state if it was a roll
      setRollPending(false);
    }

    // Safety clear for turn change
    if (!isMyTurn) {
      setRollPending(false);
    }
  }, [gameState.lastDiceRoll, isMyTurn]);

  // Determine what to show based on game state
  const hasPendingTrades = gameState.trades?.filter(t => t.to === myPlayer?.id).length > 0;
  // Show bankruptcy option when player has debt or negative money
  const hasDebt = myPlayer?.debt && myPlayer.debt.amount > 0;
  const hasNegativeMoney = myPlayer?.money < 0;
  const hasAssetsToSell = myPlayer?.properties?.length > 0 ||
    gameState?.board?.some(space => space.owner === myPlayer?.id && space.houses > 0);
  const showBankruptcy = hasDebt || hasNegativeMoney;
  const mustDeclareBankruptcy = showBankruptcy && !hasAssetsToSell;
  const showPropertyPurchase = gameState.pendingAction?.type === 'buyOrAuction' && isMyTurn;
  const showAuction = !!gameState.auction;
  const showJail = myPlayer?.inJail && isMyTurn && !gameState.diceRolled;

  return (
    <div className="actions-minimal">
      {/* Current Turn Status */}
      <div className="turn-status">
        <div className="turn-info">
          <span className="turn-token-large">{currentPlayer?.token}</span>
          <div className="turn-details">
            <span className="turn-player-name">{currentPlayer?.name}</span>
            {isMyTurn ? (
              <span className="your-turn-label">Your Turn</span>
            ) : (
              <span className="waiting-label">Playing...</span>
            )}
          </div>
        </div>

        {/* Dice Display */}
        {gameState.lastDiceRoll && (
          <DiceDisplay roll={gameState.lastDiceRoll} forceAnimate={forceDiceAnimation} />
        )}
      </div>

      {/* Main Action Button - Always visible when it's your turn */}
      {isMyTurn && !showAuction && !showPropertyPurchase && (
        <div className="main-action">
          {canEndTurn ? (
            <button className="btn-action-main end-turn" onClick={endTurn}>
              {autoEndTimer ? `✓ End Turn (${autoEndTimer}s)` : '✓ End Turn'}
            </button>
          ) : canRollDice ? (
            <button
              className="btn-action-main roll-dice"
              onClick={handleRollDice}
              disabled={isRollLocked}
            >
              🎲 Roll Dice
            </button>
          ) : null}
        </div>
      )}

      {/* Jail Options */}
      {showJail && (
        <div className="action-section jail">
          <div className="section-header">🔒 In Jail (Turn {myPlayer?.jailTurns}/3)</div>
          <div className="section-content">
            <p className="section-hint">Roll doubles to escape, or...</p>
            <div className="action-buttons">
              <button
                className="btn-action pay"
                onClick={payJailFine}
                disabled={!myPlayer || myPlayer.money < 50}
              >
                💰 Pay £50
              </button>
              {myPlayer?.getOutOfJailCards > 0 && (
                <button className="btn-action card" onClick={useJailCard}>
                  🎫 Use Card ({myPlayer.getOutOfJailCards})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Property Purchase */}
      {showPropertyPurchase && (
        <div className="action-section property">
          <div className="section-header">🏠 Property Available</div>
          <div className="section-content">
            <div className="property-offer">
              <span className="property-name">{gameState.board[myPlayer?.position]?.name}</span>
              <span className="property-cost">£{gameState.board[myPlayer?.position]?.price}</span>
            </div>
            <div className="property-balance">Your balance: £{myPlayer?.money?.toLocaleString()}</div>
            <div className="action-buttons vertical">
              <button
                className="btn-action buy"
                onClick={buyProperty}
                disabled={!myPlayer || myPlayer.money < gameState.board[myPlayer.position]?.price}
              >
                ✓ Buy
              </button>
              <button className="btn-action decline" onClick={declineProperty}>
                ✗ Auction Instead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auction */}
      {showAuction && (
        <div className="action-section auction">
          <div className="section-header">🔨 Auction</div>
          <div className="section-content">
            <div className="auction-property">{gameState.auction?.property?.name}</div>
            <div className="auction-current">
              <span className="bid-label">Current Bid:</span>
              <span className="bid-value">£{gameState.auction?.currentBid || gameState.auction?.minimumBid || 10}</span>
            </div>
            {gameState.auction?.highestBidder && (
              <div className="bid-leader">
                Leader: {gameState.players.find(p => p.id === gameState.auction.highestBidder)?.name}
              </div>
            )}

            {!gameState.auction?.passedPlayers?.includes(myPlayer?.id) ? (
              <>
                <div className="quick-bids">
                  {[10, 25, 50, 100].map(amt => (
                    <button key={amt} className="btn-quick" onClick={() => quickBid(amt)}>+£{amt}</button>
                  ))}
                </div>
                <div className="custom-bid">
                  <input
                    type="number"
                    placeholder="Custom"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                  />
                  <button className="btn-action bid" onClick={handleBid}>Bid</button>
                </div>
                <button className="btn-action pass" onClick={passBid}>Pass</button>
              </>
            ) : (
              <div className="passed-message">You passed</div>
            )}
          </div>
        </div>
      )}

      {/* Trade Offers */}
      {hasPendingTrades && (
        <div className="action-section trade-offer">
          {(() => {
            const pendingTrades = gameState.trades?.filter(t => t.to === myPlayer?.id) || [];
            const safeIndex = Math.min(currentTradeIndex, pendingTrades.length - 1);
            const trade = pendingTrades[safeIndex];
            if (!trade) return null;

            const handleAccept = () => {
              acceptTrade(trade.id);
              if (safeIndex >= pendingTrades.length - 1) setCurrentTradeIndex(0);
            };

            const handleDecline = () => {
              declineTrade(trade.id);
              if (safeIndex >= pendingTrades.length - 1) setCurrentTradeIndex(0);
            };

            const trader = gameState.players.find(p => p.id === trade.from);

            return (
              <>
                <div className="section-header">
                  📨 Trade Offer
                  {pendingTrades.length > 1 && <span className="trade-count">{safeIndex + 1}/{pendingTrades.length}</span>}
                </div>
                <div className="section-content">
                  <div className="trade-from">From: {trader?.token} {trader?.name}</div>
                  <div className="trade-exchange">
                    <div className="trade-side offer">
                      <span className="trade-label">They give:</span>
                      {trade.offer.money > 0 && <span className="trade-item money">£{trade.offer.money}</span>}
                      {trade.offer.properties?.map(idx => (
                        <span key={idx} className="trade-item property">{gameState.board[idx].name}</span>
                      ))}
                      {!trade.offer.money && (!trade.offer.properties || trade.offer.properties.length === 0) && (
                        <span className="trade-item nothing">Nothing</span>
                      )}
                    </div>
                    <span className="trade-arrow">⇄</span>
                    <div className="trade-side request">
                      <span className="trade-label">You give:</span>
                      {trade.request.money > 0 && <span className="trade-item money">£{trade.request.money}</span>}
                      {trade.request.properties?.map(idx => (
                        <span key={idx} className="trade-item property">{gameState.board[idx].name}</span>
                      ))}
                      {!trade.request.money && (!trade.request.properties || trade.request.properties.length === 0) && (
                        <span className="trade-item nothing">Nothing</span>
                      )}
                    </div>
                  </div>
                  <div className="action-buttons">
                    <button className="btn-action accept" onClick={handleAccept}>✓ Accept</button>
                    <button className="btn-action decline" onClick={handleDecline}>✗ Decline</button>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Bankruptcy Warning */}
      {showBankruptcy && (
        <div className={`action-section bankruptcy ${mustDeclareBankruptcy ? 'urgent' : ''}`}>
          <div className="section-header">⚠️ In Debt</div>
          <div className="section-content">
            <p>
              {hasDebt
                ? `You owe £${myPlayer.debt.amount.toLocaleString()} to another player.`
                : `You owe £${Math.abs(myPlayer?.money || 0).toLocaleString()}.`
              }
            </p>
            {mustDeclareBankruptcy ? (
              <>
                <p className="bankruptcy-urgent">You have no assets to sell. You must declare bankruptcy.</p>
                <button className="btn-action bankrupt urgent" onClick={declareBankruptcy}>
                  💀 Declare Bankruptcy
                </button>
              </>
            ) : (
              <>
                <p className="bankruptcy-hint">Sell houses or mortgage properties to raise funds.</p>
                <button className="btn-action bankrupt" onClick={declareBankruptcy}>
                  Declare Bankruptcy
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions Bar */}
      <div className="quick-actions">
        <button
          className={`btn-quick-action ${autoEndTurn ? 'active' : ''}`}
          onClick={toggleAutoEndTurn}
          title="Automatically end turn when no actions remain (paused if you can build houses)"
        >
          {autoEndTurn ? '⚡ Auto End' : '⚡ Auto End'}
        </button>
        <button
          className={`btn-quick-action ${showTrade ? 'active' : ''}`}
          onClick={() => setShowTrade(!showTrade)}
        >
          🤝 Trade
        </button>
        {setFollowMode && (
          <button
            className={`btn-quick-action ${followMode ? 'active' : ''}`}
            onClick={() => setFollowMode(!followMode)}
          >
            {followMode ? '🔍 Zoom' : '👁️ Follow'}
          </button>
        )}
      </div>

      {/* Trade Panel */}
      {showTrade && (
        <TradePanel
          myPlayer={myPlayer}
          players={gameState.players}
          board={gameState.board}
          proposeTrade={proposeTrade}
          onClose={() => setShowTrade(false)}
        />
      )}
    </div>
  );
}

export default ActionsPanel;
