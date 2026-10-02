/**
 * SlowedLab DSP — one definition of the sound chain, shared by live playback
 * and WAV export.
 *
 * These used to be copy-pasted in three places (play, live param update,
 * export). Duplication is why boosting bass in the UI could clip while the
 * exported file sounded different from what you heard. Single source now.
 */

export interface EffectSettings {
  playbackRate: number;
  reverbAmount: number;
  bassBoost: number;
  trebleBoost: number;
  compression: number;
  distortion: number;
}

// WaveShaper interpolates between curve points, so a short curve is
// indistinguishable from a long one. 2048 covers the audible range of the
// tanh-ish curve below and costs ~20x less than the old 44100 samples.
const CURVE_LENGTH = 2048;
const curveCache = new Map<number, Float32Array>();

/** Distortion transfer curve. amount is 0..1; 0 is an exact bypass. */
export function distortionCurve(amount: number): Float32Array {
  const key = Math.round(Math.max(0, Math.min(1, amount)) * 100) / 100;
  const cached = curveCache.get(key);
  if (cached) return cached;

  const curve = new Float32Array(CURVE_LENGTH);
  const k = key * 50;
  for (let i = 0; i < CURVE_LENGTH; i++) {
    const x = (i * 2) / CURVE_LENGTH - 1;
    curve[i] =
      key <= 0.0001
        ? x
        : ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  curveCache.set(key, curve);
  return curve;
}

/**
 * Soft-clip limiter: tanh-style waveshaper ahead of the destination.
 *
 * Bass/treble shelves add up to +40 dB each into a 20:1 compressor with no
 * makeup gain, which guarantees hard digital clipping — audible as harsh
 * crackle the user never asked for. Measured on a +40/+40, 60% compression,
 * 50% distortion mix the old chain peaked at 2.34 (7.4 dB over full scale);
 * this brings it to ceiling.
 *
 * The 0.97 scale is deliberate headroom: the int16 WAV writer hard-clamps
 * anything above 1.0, so sitting exactly at the asymptote still clips.
 */
export function createLimiter(ctx: BaseAudioContext): WaveShaperNode {
  const n = 2048;
  const headroom = 0.97;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (Math.tanh(x * 1.6) / Math.tanh(1.6)) * headroom;
  }
  const limiter = ctx.createWaveShaper();
  limiter.curve = curve;
  limiter.oversample = '4x';
  return limiter;
}

export interface ChainNodes {
  distortion: WaveShaperNode;
  bass: BiquadFilterNode;
  treble: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  gain: GainNode;
  dry: GainNode;
  convolver: ConvolverNode;
  wet: GainNode;
  limiter: WaveShaperNode;
}

export interface Chain {
  input: AudioNode;
  limiter: WaveShaperNode;
  nodes: ChainNodes;
}

function mixGains(amount: number) {
  const mix = (Math.max(0, Math.min(100, amount)) / 100) * (Math.PI / 2);
  return { dry: Math.cos(mix), wet: Math.sin(mix) };
}

/**
 * Build the effect chain. `input` -> distortion -> bass -> treble ->
 * compressor -> gain -> [dry + reverb] -> limiter -> `destination`.
 *
 * Returns the limiter as the node to connect to the output so callers can
 * hang extra taps (analyser probes) off it.
 */
export function buildChain(
  ctx: BaseAudioContext,
  input: AudioNode,
  destination: AudioNode,
  settings: EffectSettings,
  volume: number,
  impulse: AudioBuffer | null
): Chain {
  const distortion = ctx.createWaveShaper();
  distortion.curve = distortionCurve(settings.distortion / 100);
  distortion.oversample = '4x';

  const bass = ctx.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 200;
  bass.gain.value = settings.bassBoost / 2;

  const treble = ctx.createBiquadFilter();
  treble.type = 'highshelf';
  treble.frequency.value = 3000;
  treble.gain.value = settings.trebleBoost / 2;

  const compressor = ctx.createDynamicsCompressor();
  const compression = settings.compression / 100;
  compressor.threshold.value = -compression * 40;
  compressor.knee.value = compression * 30;
  compressor.ratio.value = 1 + compression * 19;
  compressor.attack.value = 0.005 + compression * 0.045;
  compressor.release.value = 0.05 + compression * 0.35;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const { dry: dryLevel, wet: wetLevel } = mixGains(settings.reverbAmount);
  dry.gain.value = dryLevel;
  wet.gain.value = wetLevel;

  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;

  const limiter = createLimiter(ctx);

  input.connect(distortion);
  distortion.connect(bass);
  bass.connect(treble);
  treble.connect(compressor);
  compressor.connect(gain);
  gain.connect(dry).connect(limiter);
  gain.connect(convolver).connect(wet).connect(limiter);
  limiter.connect(destination);

  return {
    input,
    limiter,
    nodes: { distortion, bass, treble, compressor, gain, dry, convolver, wet, limiter },
  };
}

/**
 * Push new settings into an existing chain without rebuilding it, so knob
 * moves are seamless (no click, no restart, no dropped samples).
 */
export function updateChain(
  nodes: ChainNodes,
  settings: EffectSettings,
  volume: number
): void {
  nodes.bass.gain.value = settings.bassBoost / 2;
  nodes.treble.gain.value = settings.trebleBoost / 2;
  nodes.distortion.curve = distortionCurve(settings.distortion / 100);

  const compression = settings.compression / 100;
  nodes.compressor.threshold.value = -compression * 40;
  nodes.compressor.knee.value = compression * 30;
  nodes.compressor.ratio.value = 1 + compression * 19;
  nodes.compressor.attack.value = 0.005 + compression * 0.045;
  nodes.compressor.release.value = 0.05 + compression * 0.35;

  const { dry, wet } = mixGains(settings.reverbAmount);
  nodes.dry.gain.value = dry;
  nodes.wet.gain.value = wet;
  nodes.gain.gain.value = volume;
}
