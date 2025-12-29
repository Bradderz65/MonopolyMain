import React, { useEffect, useRef } from 'react';

function GameLog({ log }) {
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  if (!log || log.length === 0) {
    return (
      <div className="game-log">
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: 20 }}>
          No game events yet.
        </p>
      </div>
    );
  }

  return (
    <div className="game-log">
      {log.map((entry, index) => (
        <div key={index} className="log-entry">
          <span className="log-time">{formatTime(entry.time)}</span>
          <span>{entry.message}</span>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

export default GameLog;
