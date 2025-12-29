const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioContext = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
};

const playTone = (frequency, duration, type = 'sine', volume = 0.3) => {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.log('Audio not supported');
  }
};

const playNotes = (notes, tempo = 150) => {
  notes.forEach((note, i) => {
    setTimeout(() => {
      playTone(note.freq, note.duration || 0.15, note.type || 'sine', note.volume || 0.3);
    }, i * tempo);
  });
};

export const sounds = {
  diceRoll: () => {
    const notes = [
      { freq: 200, duration: 0.05 },
      { freq: 250, duration: 0.05 },
      { freq: 300, duration: 0.05 },
      { freq: 350, duration: 0.05 },
      { freq: 400, duration: 0.05 },
      { freq: 450, duration: 0.1 },
    ];
    playNotes(notes, 50);
  },

  diceResult: () => {
    playTone(600, 0.15, 'sine', 0.4);
    setTimeout(() => playTone(800, 0.2, 'sine', 0.4), 100);
  },

  move: () => {
    playTone(440, 0.1, 'sine', 0.2);
  },

  passGo: () => {
    const notes = [
      { freq: 523, duration: 0.15 },
      { freq: 659, duration: 0.15 },
      { freq: 784, duration: 0.2 },
    ];
    playNotes(notes, 120);
  },

  buyProperty: () => {
    const notes = [
      { freq: 400, duration: 0.1 },
      { freq: 500, duration: 0.1 },
      { freq: 600, duration: 0.15 },
    ];
    playNotes(notes, 80);
  },

  payRent: () => {
    playTone(300, 0.2, 'sawtooth', 0.2);
    setTimeout(() => playTone(250, 0.3, 'sawtooth', 0.2), 150);
  },

  collectMoney: () => {
    const notes = [
      { freq: 800, duration: 0.08 },
      { freq: 1000, duration: 0.08 },
      { freq: 1200, duration: 0.1 },
    ];
    playNotes(notes, 60);
  },

  payMoney: () => {
    playTone(400, 0.15, 'triangle', 0.3);
    setTimeout(() => playTone(300, 0.2, 'triangle', 0.3), 100);
  },

  jail: () => {
    const notes = [
      { freq: 400, duration: 0.2, type: 'square' },
      { freq: 300, duration: 0.2, type: 'square' },
      { freq: 200, duration: 0.3, type: 'square' },
    ];
    playNotes(notes, 150);
  },

  jailFree: () => {
    const notes = [
      { freq: 400, duration: 0.1 },
      { freq: 500, duration: 0.1 },
      { freq: 600, duration: 0.1 },
      { freq: 800, duration: 0.2 },
    ];
    playNotes(notes, 100);
  },

  buildHouse: () => {
    playTone(350, 0.1, 'square', 0.2);
    setTimeout(() => playTone(450, 0.15, 'square', 0.2), 80);
  },

  sellHouse: () => {
    playTone(450, 0.1, 'square', 0.2);
    setTimeout(() => playTone(350, 0.15, 'square', 0.2), 80);
  },

  mortgage: () => {
    playTone(250, 0.3, 'triangle', 0.25);
  },

  unmortgage: () => {
    playTone(350, 0.15, 'triangle', 0.25);
    setTimeout(() => playTone(450, 0.2, 'triangle', 0.25), 100);
  },

  card: () => {
    const notes = [
      { freq: 600, duration: 0.1 },
      { freq: 700, duration: 0.1 },
      { freq: 600, duration: 0.15 },
    ];
    playNotes(notes, 100);
  },

  auction: () => {
    playTone(500, 0.1, 'sine', 0.3);
    setTimeout(() => playTone(600, 0.1, 'sine', 0.3), 150);
    setTimeout(() => playTone(700, 0.15, 'sine', 0.3), 300);
  },

  bid: () => {
    playTone(550, 0.1, 'sine', 0.25);
  },

  auctionWin: () => {
    const notes = [
      { freq: 523, duration: 0.1 },
      { freq: 659, duration: 0.1 },
      { freq: 784, duration: 0.1 },
      { freq: 1047, duration: 0.2 },
    ];
    playNotes(notes, 100);
  },

  trade: () => {
    playTone(440, 0.1, 'sine', 0.2);
    setTimeout(() => playTone(550, 0.15, 'sine', 0.2), 100);
  },

  tradeAccept: () => {
    const notes = [
      { freq: 500, duration: 0.1 },
      { freq: 600, duration: 0.1 },
      { freq: 750, duration: 0.15 },
    ];
    playNotes(notes, 80);
  },

  tradeDecline: () => {
    playTone(400, 0.15, 'sawtooth', 0.2);
    setTimeout(() => playTone(300, 0.2, 'sawtooth', 0.2), 100);
  },

  turnStart: () => {
    playTone(660, 0.1, 'sine', 0.2);
  },

  bankrupt: () => {
    const notes = [
      { freq: 400, duration: 0.2, type: 'sawtooth' },
      { freq: 350, duration: 0.2, type: 'sawtooth' },
      { freq: 300, duration: 0.2, type: 'sawtooth' },
      { freq: 200, duration: 0.4, type: 'sawtooth' },
    ];
    playNotes(notes, 200);
  },

  win: () => {
    const notes = [
      { freq: 523, duration: 0.15 },
      { freq: 659, duration: 0.15 },
      { freq: 784, duration: 0.15 },
      { freq: 1047, duration: 0.15 },
      { freq: 784, duration: 0.15 },
      { freq: 1047, duration: 0.3 },
    ];
    playNotes(notes, 150);
  },

  error: () => {
    playTone(200, 0.2, 'square', 0.2);
  },

  click: () => {
    playTone(800, 0.05, 'sine', 0.15);
  },

  doubles: () => {
    const notes = [
      { freq: 600, duration: 0.1 },
      { freq: 800, duration: 0.1 },
      { freq: 600, duration: 0.1 },
      { freq: 800, duration: 0.15 },
    ];
    playNotes(notes, 80);
  }
};

export default sounds;
