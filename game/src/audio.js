// SOLMAR's sound: everything is synthesised with WebAudio — engine hum, police
// sirens, gunfire, pickups and a small bass-driven music loop. No audio files.
// The context starts on the first user gesture, as browsers require.

/** Create the sound engine. Call unlock() from a click or key press. */
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineNodes = null;
  let sirenNodes = null;
  let musicTimer = null;
  let musicStep = 0;

  /** A minor-key bass line that loops under the game. */
  const BASS_LINE = [55, 0, 55, 65.41, 55, 0, 49, 58.27, 55, 0, 55, 65.41, 73.42, 0, 65.41, 49];
  const MUSIC_STEP_SECONDS = 0.22;

  function ensureContext() {
    if (ctx) return ctx;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, seconds, type, volume, slideTo) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  function noise(seconds, volume, filterFreq) {
    if (!ctx || muted) return;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function scheduleMusicStep() {
    if (!ctx || muted) return;
    const freq = BASS_LINE[musicStep % BASS_LINE.length];
    if (freq > 0) tone(freq, MUSIC_STEP_SECONDS * 0.9, 'triangle', 0.16);
    if (musicStep % 4 === 0) tone(120, 0.12, 'sine', 0.3, 40);
    musicStep += 1;
  }

  return {
    /** Start the audio context (must run inside a user gesture). */
    unlock() {
      const c = ensureContext();
      if (c && c.state === 'suspended') c.resume();
      if (c && !musicTimer) {
        musicTimer = window.setInterval(scheduleMusicStep, MUSIC_STEP_SECONDS * 1000);
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    gunshot() {
      noise(0.14, 0.5, 3200);
      tone(160, 0.1, 'square', 0.18, 60);
    },
    enemyShot() {
      noise(0.1, 0.22, 2200);
    },
    crash(strength) {
      noise(0.25, Math.min(0.7, 0.2 + strength * 0.4), 500);
      tone(70, 0.2, 'sine', 0.4, 35);
    },
    pickup() {
      tone(880, 0.1, 'sine', 0.25);
      window.setTimeout(() => tone(1318, 0.14, 'sine', 0.25), 90);
    },
    cash() {
      tone(1046, 0.09, 'triangle', 0.3);
      window.setTimeout(() => tone(1568, 0.16, 'triangle', 0.3), 80);
    },
    missionStart() {
      tone(392, 0.12, 'triangle', 0.3);
      window.setTimeout(() => tone(523, 0.12, 'triangle', 0.3), 120);
      window.setTimeout(() => tone(659, 0.2, 'triangle', 0.3), 240);
    },
    missionComplete() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((n, i) => window.setTimeout(() => tone(n, 0.22, 'triangle', 0.32), i * 130));
    },
    wasted() {
      tone(220, 0.5, 'sawtooth', 0.25, 55);
    },
    busted() {
      tone(440, 0.18, 'square', 0.2, 440);
      window.setTimeout(() => tone(440, 0.18, 'square', 0.2, 440), 220);
    },
    doorSlam() {
      noise(0.08, 0.4, 700);
    },
    /** Start the engine loop; setEngineSpeed adjusts its pitch with speed. */
    startEngine() {
      if (!ctx || engineNodes || muted) return;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 60;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const gain = ctx.createGain();
      gain.gain.value = 0.12;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start();
      engineNodes = { osc, filter, gain };
    },
    setEngineSpeed(fraction) {
      if (!engineNodes) return;
      engineNodes.osc.frequency.setTargetAtTime(55 + fraction * 130, ctx.currentTime, 0.08);
      engineNodes.filter.frequency.setTargetAtTime(280 + fraction * 900, ctx.currentTime, 0.08);
    },
    stopEngine() {
      if (!engineNodes) return;
      try { engineNodes.osc.stop(); } catch { /* already stopped */ }
      engineNodes = null;
    },
    /** Start the two-tone police siren loop. */
    startSiren() {
      if (!ctx || sirenNodes) return;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 750;
      const gain = ctx.createGain();
      gain.gain.value = 0.07;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      lfo.start();
      sirenNodes = { osc, lfo, gain };
    },
    stopSiren() {
      if (!sirenNodes) return;
      try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      sirenNodes = null;
    },
  };
}
