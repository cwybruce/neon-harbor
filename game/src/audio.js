// Procedural sound: everything is synthesized with WebAudio, so the game needs no
// audio files. Sounds start only after the player presses a key or clicks, and M
// mutes them all.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted || !ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted || !ctx) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // Ignore.
    }
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) this.stopEngine();
    },
    isMuted() { return muted; },

    /** Continuous engine hum whose pitch follows speed (0..1). */
    engine(speed01) {
      if (!ensure() || muted || !ctx) return;
      try {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineOsc.type = 'sawtooth';
          engineGain = ctx.createGain();
          engineGain.gain.value = 0;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 420;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.setValueAtTime(50 + speed01 * 130, ctx.currentTime);
        engineGain.gain.setTargetAtTime(0.02 + speed01 * 0.05, ctx.currentTime, 0.08);
      } catch {
        // Ignore.
      }
    },
    stopEngine() {
      try {
        if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      } catch {
        // Ignore.
      }
    },

    /** Two-tone police siren while any police are close; call every frame. */
    siren(active, dt) {
      if (!ensure() || muted || !ctx) return;
      try {
        if (!active) {
          if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
          return;
        }
        if (!sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenOsc.type = 'triangle';
          sirenGain = ctx.createGain();
          sirenGain.gain.value = 0;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
        }
        sirenTimer += dt;
        const high = Math.floor(sirenTimer / 0.45) % 2 === 0;
        sirenOsc.frequency.setValueAtTime(high ? 880 : 660, ctx.currentTime);
        sirenGain.gain.setTargetAtTime(0.03, ctx.currentTime, 0.05);
      } catch {
        // Ignore.
      }
    },

    shoot() { noise(0.12, 0.5, 2600); tone(180, 0.08, 'square', 0.25, 60); },
    punch() { noise(0.08, 0.35, 900); },
    pickup() { tone(660, 0.09, 'sine', 0.3); tone(990, 0.12, 'sine', 0.25); },
    crash() { noise(0.25, 0.6, 500); },
    steal() { tone(220, 0.15, 'square', 0.2, 440); },
    busted() { tone(330, 0.5, 'sawtooth', 0.25, 110); },
    mission() {
      tone(523, 0.12, 'sine', 0.3);
      setTimeout(() => tone(659, 0.12, 'sine', 0.3), 110);
      setTimeout(() => tone(784, 0.2, 'sine', 0.3), 220);
    },
    complete() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sine', 0.3), i * 130));
    },
  };
}
