import React, { useState } from 'react';

function Lobby({ playerName, setPlayerName, games, createGame, joinGame, onReset }) {
  const [gameName, setGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [isPrivate, setIsPrivate] = useState(false);
  const [auctionsEnabled, setAuctionsEnabled] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [resetting, setResetting] = useState(false);
  const [showJoinByCode, setShowJoinByCode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset? This will delete ALL saved games and cannot be undone!')) {
      return;
    }

    setResetting(true);
    try {
      await onReset();
      alert('All games have been reset!');
    } catch (err) {
      alert('Failed to reset: ' + err.message);
    }
    setResetting(false);
  };

  const handleCreateGame = (e) => {
    e.preventDefault();
    if (!playerName.trim()) {
      alert('Please enter your name first');
      return;
    }
    createGame(gameName || `${playerName}'s Game`, maxPlayers, isPrivate, auctionsEnabled);
  };

  const handleJoinGame = (gameId) => {
    if (!playerName.trim()) {
      alert('Please enter your name first');
      return;
    }
    joinGame(gameId);
  };

  const handleJoinByCode = (e) => {
    e.preventDefault();
    if (!playerName.trim()) {
      alert('Please enter your name first');
      return;
    }
    if (!joinCode.trim()) {
      alert('Please enter a game code');
      return;
    }
    joinGame(joinCode.trim().toUpperCase());
  };

  return (
    <div className="lobby-minimal">
      <div className="lobby-minimal-content">
        {/* Logo */}
        <div className="lobby-logo">
          <span className="lobby-logo-icon">🏠🏨</span>
          <h1 className="lobby-logo-text">MONOPOLY</h1>
        </div>

        {/* Player Name Input */}
        <div className="lobby-name-input">
          <span className="name-icon">👤</span>
          <input
            type="text"
            placeholder="Enter your name..."
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
          />
          {playerName && <span className="name-check">✓</span>}
        </div>

        {/* Available Games - Show prominently if any exist */}
        {games.length > 0 && (
          <div className="lobby-available-games">
            <div className="available-games-header">
              <span className="pulse-dot"></span>
              <span>Games Available to Join</span>
            </div>
            <div className="available-games-list">
              {games.map((game) => (
                <div key={game.id} className="available-game-card">
                  <div className="available-game-info">
                    <span className="available-game-name">{game.name}</span>
                    <span className="available-game-meta">
                      👑 {game.host} • 👥 {game.players}/{game.maxPlayers}
                    </span>
                  </div>
                  <button
                    className="btn btn-success"
                    onClick={() => handleJoinGame(game.id)}
                    disabled={!playerName.trim()}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Divider when games exist */}
        {games.length > 0 && (
          <div className="lobby-divider">
            <span>or</span>
          </div>
        )}

        {/* Main Actions */}
        <div className="lobby-actions">
          <button
            className="btn btn-primary btn-large"
            onClick={handleCreateGame}
            disabled={!playerName.trim()}
          >
            ✚ Create New Game
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setShowJoinByCode(!showJoinByCode)}
          >
            🔑 Join by Code
          </button>
        </div>

        {/* Join by Code - Expandable */}
        {showJoinByCode && (
          <form className="lobby-code-form" onSubmit={handleJoinByCode}>
            <input
              type="text"
              className="code-input-minimal"
              placeholder="GAME CODE"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoFocus
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!playerName.trim() || !joinCode.trim()}
            >
              Join
            </button>
          </form>
        )}

        {/* Settings Toggle */}
        <button
          className="btn-settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
        >
          ⚙️ Game Settings {showSettings ? '▲' : '▼'}
        </button>

        {/* Game Settings - Collapsible */}
        {showSettings && (
          <div className="lobby-settings">
            <div className="setting-row">
              <label>Game Name</label>
              <input
                type="text"
                placeholder="My Game"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                maxLength={30}
              />
            </div>

            <div className="setting-row">
              <label>Max Players</label>
              <div className="player-count-buttons">
                {[2, 3, 4, 5, 6, 7, 8].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`count-btn-minimal ${maxPlayers === num ? 'selected' : ''}`}
                    onClick={() => setMaxPlayers(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row toggle-row">
              <label className="toggle-label-minimal">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                <span className="toggle-track"></span>
                🔒 Private Game
              </label>
            </div>

            <div className="setting-row toggle-row">
              <label className="toggle-label-minimal">
                <input
                  type="checkbox"
                  checked={auctionsEnabled}
                  onChange={(e) => setAuctionsEnabled(e.target.checked)}
                />
                <span className="toggle-track"></span>
                🔨 Enable Auctions
              </label>
            </div>
          </div>
        )}

        {/* Reset Button */}
        <button
          className="btn-reset-minimal"
          onClick={handleReset}
          disabled={resetting}
        >
          {resetting ? 'Resetting...' : '🗑️ Reset All Games'}
        </button>
      </div>
    </div>
  );
}

export default Lobby;
