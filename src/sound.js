// Field recording licenses and edits are documented alongside the audio files.
const audioDirectory = (import.meta.env?.BASE_URL ?? '/') + 'assets/audio/';
const clamp = (v, low, high) => Math.max(low, Math.min(v, high));
const between = (a, b) => a + Math.random() * (b - a);

function noiseLoop(ctx) {
  const frames = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(2, frames, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    let soft = 0;
    for (let i = 0; i < frames; i++) {
      soft = 0.965 * soft + 0.035 * (Math.random() * 2 - 1);
      samples[i] = soft * 3.2;
    }
    // Wrap without a click. The river's recording has its own crossfade.
    const step = samples[frames - 1] - samples[0];
    for (let i = 0; i < 192; i++) samples[i] += (1 - i / 192) * step;
  }
  return buffer;
}

export function createSound() {
  let ctx, output, wind, windFilter, bed;
  let muted = false, paused = false, volume = 0.8;
  let elapsed = 0, nextMix = 0, nextBird = 1.1, lastStroke = -1, previousPhrase = -1;
  let lastBirdBank = 1;
  const buffers = new Map();
  const abort = new AbortController();
  let birds = null;

  function refreshLevel() {
    if (!ctx) return;
    const value = paused || muted || document.hidden ? 0 : volume;
    output.gain.setTargetAtTime(value, ctx.currentTime, 0.07);
  }

  async function load(id) {
    const audio = ctx;
    const response = await fetch(audioDirectory + id + '.mp3', { signal: abort.signal });
    if (!response.ok) throw new Error('Could not load ' + id);
    const buffer = await audio.decodeAudioData(await response.arrayBuffer());
    if (audio !== ctx) return;
    buffers.set(id, buffer);
    if (id === 'river') {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(bed);
      source.start();
    }
  }

  function initialize() {
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!Audio || abort.signal.aborted) return;
    ctx = new Audio();
    output = ctx.createGain();
    output.gain.value = 0;
    output.connect(ctx.destination);
    bed = ctx.createGain();
    bed.gain.value = 0.65;
    bed.connect(output);

    // A very quiet, wide-band rustle breathes between the bird phrases. Its
    // spectrum opens as the canoe drifts nearer to either wooded bank.
    const air = ctx.createBufferSource();
    air.buffer = noiseLoop(ctx);
    air.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 1100;
    windFilter.Q.value = 0.65;
    wind = ctx.createGain();
    wind.gain.value = 0.065;
    air.connect(windFilter).connect(wind).connect(output);
    air.start();
    for (const id of ['river', 'canopy', 'stroke-1', 'stroke-2', 'stroke-3', 'stroke-4']) {
      load(id).catch(error => {
        if (!abort.signal.aborted) console.warn('River audio', error);
      });
    }
    refreshLevel();
  }

  function start() {
    if (!ctx) initialize();
    return unlock();
  }

  // An LT/RT press starts the simulation. Some browsers still require a
  // trusted DOM gesture to resume an AudioContext created during polling.
  function unlock() {
    if (ctx && ctx.state !== 'running' && !document.hidden) {
      return ctx.resume().catch(() => {});
    }
  }
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', refreshLevel);

  function voice(buffer, opts) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = opts.rate;
    const pan = ctx.createStereoPanner();
    pan.pan.value = opts.pan;
    const gain = ctx.createGain();
    const now = ctx.currentTime, end = now + opts.duration / opts.rate;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(opts.gain, now + opts.attack);
    gain.gain.setValueAtTime(opts.gain, Math.max(now + opts.attack, end - opts.release));
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(pan).connect(gain).connect(output);
    source.start(now, opts.offset, opts.duration);
    source.onended = () => {
      source.disconnect();
      pan.disconnect();
      gain.disconnect();
      if (birds?.pan === pan) birds = null;
    };
    return pan;
  }

  function stroke(side, strength = 1) {
    if (!ctx || paused || muted || ctx.state !== 'running') return;
    let index = (lastStroke + 1 + Math.floor(Math.random() * 3)) % 4;
    // Permit the first stroke while the other variants are still decoding.
    let buffer;
    for (let n = 0; n < 4; n++, index = (index + 1) % 4) {
      buffer = buffers.get('stroke-' + (index + 1));
      if (buffer) break;
    }
    if (!buffer) return;
    lastStroke = index;
    voice(buffer, {
      rate: between(1.06, 1.16) + 0.13 * strength, pan: side === 'left' ? -0.62 : 0.62,
      gain: 0.27 + 0.44 * strength, duration: buffer.duration, offset: 0,
      attack: 0.014, release: 0.25
    });
  }

  function update(dt, motion) {
    if (!ctx || paused || document.hidden || ctx.state !== 'running') return;
    elapsed += Math.min(dt, 0.1);
    if (elapsed < nextMix) return;
    nextMix = elapsed + 0.1;
    const now = ctx.currentTime;
    const nearBank = Math.abs(motion.across ?? 0);
    const breeze = 0.45 + 0.22 * Math.sin(0.19 * elapsed) + 0.18 * Math.cos(0.47 * elapsed + 0.5);
    wind.gain.setTargetAtTime(0.035 + 0.11 * breeze + 0.06 * nearBank, now, 0.5);
    windFilter.frequency.setTargetAtTime(700 + 1300 * breeze + 300 * nearBank, now, 1);
    bed.gain.setTargetAtTime(0.58 + Math.min(motion.speed, 3) * 0.045 + 0.05 * Math.sin(motion.s * 0.056), now, 0.6);

    if (birds) {
      const dx = birds.x - motion.x, ds = birds.s - motion.s;
      // Project the fixed sound source onto the canoe's right axis.
      const pan = (dx * Math.cos(motion.yaw) + ds * Math.sin(motion.yaw)) / Math.max(1, Math.hypot(dx, ds));
      birds.pan.pan.setTargetAtTime(0.8 * pan, now, 0.35);
    }
    const canopy = buffers.get('canopy');
    if (!canopy || muted || elapsed < nextBird) return;
    const phrases = [[0.8, 3.8], [5.3, 3.5], [10.1, 3.3], [14.6, 3.5], [18.9, 3.1], [23.5, 4.6]];
    previousPhrase = (previousPhrase + 1 + Math.floor(Math.random() * (phrases.length - 1))) % phrases.length;
    const [offset, duration] = phrases[previousPhrase];
    const bank = Math.random() < 0.72 ? -lastBirdBank : lastBirdBank;
    lastBirdBank = bank;
    const pan = voice(canopy, {
      pan: 0.65 * bank, rate: between(0.9, 1.06), gain: between(0.44, 0.76),
      offset, duration, attack: 0.32, release: 0.48
    });
    birds = { pan, x: motion.x + bank * between(8, 20), s: motion.s + between(6, 20) };
    nextBird = elapsed + duration + between(3.5, 12.5);
  }

  return {
    start, update, stroke,
    setMuted(value) { muted = Boolean(value); refreshLevel(); },
    setVolume(value) { volume = clamp(value, 0, 1); refreshLevel(); },
    setPaused(value) { paused = Boolean(value); refreshLevel(); },
    dispose() {
      abort.abort();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', refreshLevel);
      const audio = ctx;
      ctx = null;
      buffers.clear();
      audio?.close().catch(() => {});
    }
  };
}
