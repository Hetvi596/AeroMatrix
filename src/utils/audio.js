// Ambient Atmospheric Audio Synthesizer using Web Audio API
// Zero external files, 100% offline, lightweight, high-fidelity ambient pad

let audioCtx = null;
let masterGain = null;
let osc1 = null;
let osc2 = null;
let filter = null;
let noiseNode = null;
let isPlaying = false;

export function toggleAmbientAudio() {
  if (isPlaying) {
    stopAmbientAudio();
    return false;
  } else {
    startAmbientAudio();
    return true;
  }
}

export function isAudioActive() {
  return isPlaying;
}

export function startAmbientAudio() {
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
    }
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    masterGain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 3); // Soft ambient volume
    masterGain.connect(audioCtx.destination);

    // Deep harmonic base drone (65.4 Hz - C2)
    osc1 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(65.4, audioCtx.currentTime);

    // Atmospheric 5th (98 Hz - G2)
    osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(98.0, audioCtx.currentTime);

    // Subtle atmospheric filter
    filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, audioCtx.currentTime);
    filter.Q.setValueAtTime(2, audioCtx.currentTime);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(masterGain);

    osc1.start();
    osc2.start();

    // Soft pink noise for wind / airflow
    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(320, audioCtx.currentTime);
    noiseFilter.Q.setValueAtTime(1.5, audioCtx.currentTime);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.015, audioCtx.currentTime);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);

    noiseNode.start();
    isPlaying = true;
    return true;
  } catch (err) {
    console.warn('Web Audio init prevented or not supported:', err);
    return false;
  }
}

export function stopAmbientAudio() {
  if (masterGain && audioCtx) {
    try {
      masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2);
      setTimeout(() => {
        if (osc1) { osc1.stop(); osc1.disconnect(); osc1 = null; }
        if (osc2) { osc2.stop(); osc2.disconnect(); osc2 = null; }
        if (noiseNode) { noiseNode.stop(); noiseNode.disconnect(); noiseNode = null; }
        isPlaying = false;
      }, 1300);
    } catch {
      isPlaying = false;
    }
  } else {
    isPlaying = false;
  }
}
