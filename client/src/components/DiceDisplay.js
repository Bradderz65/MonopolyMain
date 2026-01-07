import React, { useState, useEffect, useRef } from 'react';

function DiceDisplay({ roll, forceAnimate }) {
  const { die1, die2, total, isDoubles } = roll;
  const [visualDie1, setVisualDie1] = useState(die1);
  const [visualDie2, setVisualDie2] = useState(die2);
  const [isRolling, setIsRolling] = useState(false);
  
  // Track displayed total and doubles to avoid instant updates/resizing
  const [displayTotal, setDisplayTotal] = useState(total);
  const [displayDoubles, setDisplayDoubles] = useState(isDoubles);
  
  const lastRollRef = useRef(roll);
  // Track the specific roll object we last animated to prevent re-triggering loop
  const lastAnimatedRollRef = useRef(null);

  useEffect(() => {
    const isNewRoll = roll !== lastRollRef.current;
    // Animate if it's a new roll OR if forced (but only if we haven't animated this roll yet)
    const shouldAnimate = (isNewRoll || (forceAnimate && roll !== lastAnimatedRollRef.current));

    if (shouldAnimate && !isRolling) {
      lastRollRef.current = roll;
      lastAnimatedRollRef.current = roll;
      
      setIsRolling(true);
      
      let rollingInterval = setInterval(() => {
        setVisualDie1(Math.floor(Math.random() * 6) + 1);
        setVisualDie2(Math.floor(Math.random() * 6) + 1);
      }, 80);

      setTimeout(() => {
        clearInterval(rollingInterval);
        setVisualDie1(die1);
        setVisualDie2(die2);
        
        setDisplayTotal(total);
        setDisplayDoubles(isDoubles);
        
        setIsRolling(false);
      }, 600);

      return () => clearInterval(rollingInterval);
    } else {
      // Sync values if we are not animating
      if (!isRolling) {
         if (displayTotal !== total || displayDoubles !== isDoubles) {
             setDisplayTotal(total);
             setDisplayDoubles(isDoubles);
             setVisualDie1(die1);
             setVisualDie2(die2);
         }
         lastRollRef.current = roll;
      }
    }
  }, [roll, die1, die2, total, isDoubles, forceAnimate, isRolling, displayTotal, displayDoubles]);

  return (
    <div className={`dice-mini ${isRolling ? 'rolling' : ''}`}>
      <span className={`die ${isRolling ? 'shake' : ''}`}>{visualDie1}</span>
      <span className={`die ${isRolling ? 'shake' : ''}`}>{visualDie2}</span>
      
      {/* Use displayTotal/displayDoubles and keep them in the DOM to prevent resizing */}
      <span className="dice-sum" style={{ opacity: isRolling ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        = {displayTotal}
      </span>
      
      {displayDoubles && (
        <span className="doubles" style={{ opacity: isRolling ? 0.5 : 1, transition: 'opacity 0.2s' }}>
          ×2
        </span>
      )}
    </div>
  );
}

export default DiceDisplay;