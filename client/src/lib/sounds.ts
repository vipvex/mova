const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = frequency;
  oscillator.type = type;
  
  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

function playChord(frequencies: number[], duration: number, type: OscillatorType = 'sine', volume: number = 0.15) {
  frequencies.forEach(freq => playTone(freq, duration, type, volume));
}

export function playStarUnlock(index: number = 0) {
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  const baseFreq = 523.25 + (index * 50);
  playTone(baseFreq, 0.15, 'sine', 0.25);
  
  setTimeout(() => {
    playTone(baseFreq * 1.25, 0.2, 'sine', 0.2);
  }, 80);
  
  setTimeout(() => {
    playTone(baseFreq * 1.5, 0.3, 'triangle', 0.15);
  }, 150);
}

export function playSuccessChime() {
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  const melody = [523.25, 659.25, 783.99, 1046.50];
  melody.forEach((freq, i) => {
    setTimeout(() => {
      playTone(freq, 0.2, 'sine', 0.2);
    }, i * 100);
  });
}

export function playLevelComplete() {
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  const fanfare = [
    { freq: 523.25, delay: 0 },
    { freq: 659.25, delay: 100 },
    { freq: 783.99, delay: 200 },
    { freq: 1046.50, delay: 350 },
    { freq: 783.99, delay: 500 },
    { freq: 1046.50, delay: 650 },
    { freq: 1318.51, delay: 800 },
  ];
  
  fanfare.forEach(({ freq, delay }) => {
    setTimeout(() => {
      playChord([freq, freq * 1.25, freq * 1.5], 0.4, 'sine', 0.12);
    }, delay);
  });
  
  setTimeout(() => {
    playChord([523.25, 659.25, 783.99, 1046.50], 1.0, 'triangle', 0.1);
  }, 1000);
}

export function playConfettiPop() {
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  const noise = audioContext.createBufferSource();
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.1, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioContext.sampleRate * 0.02));
  }
  
  noise.buffer = buffer;
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 0.15;
  
  noise.connect(gainNode);
  gainNode.connect(audioContext.destination);
  noise.start();
}

export function resumeAudioContext() {
  if (audioContext.state === 'suspended') {
    return audioContext.resume();
  }
  return Promise.resolve();
}
