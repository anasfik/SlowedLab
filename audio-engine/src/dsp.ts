/**
 * Core Audio DSP Engine
 * Implements high-quality audio processing algorithms
 */

import {
  AudioBuffer as AudioBufferType,
  TimeStretchSettings,
  ReverbSettings,
  EqualizerSettings,
  CompressorSettings,
  DelaySettings,
  EffectsConfig,
  ProcessingProgress,
  AudioAnalysis,
  AnalysisOptions,
} from './types';

// ============= PHASE VOCODER (TIME-STRETCH) =============

class PhaseVocoder {
  private windowSize: number;
  private hopSize: number;
  private window: Float32Array;
  private fft: FFT;

  constructor(windowSize: number = 2048) {
    this.windowSize = windowSize;
    this.hopSize = windowSize / 4; // 75% overlap
    this.window = this.createHannWindow(windowSize);
    this.fft = new FFT(windowSize);
  }

  private createHannWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return window;
  }

  /**
   * Apply phase vocoder time-stretching
   * Preserves pitch while changing tempo
   */
  async process(
    inputChannels: Float32Array[],
    rate: number,
    preservePitch: boolean
  ): Promise<Float32Array[]> {
    const outputChannels: Float32Array[] = [];

    for (const channel of inputChannels) {
      const stretched = this.processChannel(channel, rate, preservePitch);
      outputChannels.push(stretched);
    }

    return outputChannels;
  }

  private processChannel(
    input: Float32Array,
    rate: number,
    preservePitch: boolean
  ): Float32Array {
    // Calculate output size
    const outputLength = Math.ceil(input.length / rate);
    const output = new Float32Array(outputLength);

    const numFrames = Math.floor((input.length - this.windowSize) / this.hopSize);
    const outputHopSize = Math.floor(this.hopSize / rate);

    // Buffers for processing
    const frame = new Float32Array(this.windowSize);
    const spectrum = new Float32Array(this.windowSize);
    const outputFrame = new Float32Array(this.windowSize);

    let inputPos = 0;
    let outputPos = 0;

    for (let i = 0; i < numFrames; i++) {
      // Extract frame
      for (let j = 0; j < this.windowSize; j++) {
        const idx = inputPos + j;
        frame[j] = idx < input.length ? input[idx] * this.window[j] : 0;
      }

      // Forward FFT
      const fftResult = this.fft.forward(frame);

      // Apply phase vocoder processing
      if (preservePitch) {
        this.phaseVocoderStretch(fftResult, rate);
      } else {
        // Simple time-stretch without pitch preservation
        // (optional: add pitch shifting here)
      }

      // Inverse FFT
      const ifftResult = this.fft.inverse(fftResult);

      // Apply window and overlap-add
      for (let j = 0; j < this.windowSize; j++) {
        outputFrame[j] = ifftResult[j] * this.window[j];
      }

      // Overlap-add
      const outIdx = i * outputHopSize;
      for (let j = 0; j < this.windowSize && outIdx + j < outputLength; j++) {
        output[outIdx + j] += outputFrame[j];
      }

      inputPos += this.hopSize;
    }

    return output;
  }

  private phaseVocoderStretch(
    spectrum: { real: Float32Array; imag: Float32Array },
    rate: number
  ): void {
    const bins = spectrum.real.length;
    const expectedPhaseAdvance = (2 * Math.PI * this.hopSize) / bins;

    for (let k = 0; k < bins / 2; k++) {
      const magnitude = Math.sqrt(
        spectrum.real[k] ** 2 + spectrum.imag[k] ** 2
      );
      let phase = Math.atan2(spectrum.imag[k], spectrum.real[k]);

      // Compute phase deviation
      const phaseDiff = phase; // Simplified; full implementation tracks previous phase
      const deviationPerHz = phaseDiff / expectedPhaseAdvance;

      // Adjust phase for time-stretching
      const newPhaseAdvance = expectedPhaseAdvance * rate;
      const newPhase = phase + newPhaseAdvance + deviationPerHz * expectedPhaseAdvance;

      spectrum.real[k] = magnitude * Math.cos(newPhase);
      spectrum.imag[k] = magnitude * Math.sin(newPhase);
    }
  }
}

// ============= FAST FOURIER TRANSFORM =============

class FFT {
  private size: number;
  private cosTable: Float32Array;
  private sinTable: Float32Array;

  constructor(size: number) {
    this.size = size;
    this.cosTable = new Float32Array(size);
    this.sinTable = new Float32Array(size);

    for (let i = 0; i < size; i++) {
      const angle = (-2 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }
  }

  forward(real: Float32Array): { real: Float32Array; imag: Float32Array } {
    const imag = new Float32Array(this.size);
    this.fft(real, imag);
    return { real, imag };
  }

  inverse(spectrum: {
    real: Float32Array;
    imag: Float32Array;
  }): Float32Array {
    const real = new Float32Array(spectrum.real);
    const imag = new Float32Array(spectrum.imag);

    // Swap and negate imaginary parts
    for (let i = 0; i < this.size; i++) {
      imag[i] = -imag[i];
    }

    this.fft(real, imag);

    // Normalize
    for (let i = 0; i < this.size; i++) {
      real[i] /= this.size;
    }

    return real;
  }

  private fft(real: Float32Array, imag: Float32Array): void {
    let n = this.size;
    if (n === 1) return;

    // Bit-reversal
    for (let i = 0; i < n; i++) {
      const j = this.reverseBits(i, Math.log2(n));
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    // Cooley-Tukey FFT
    for (let s = 1; s <= Math.log2(n); s++) {
      const m = 1 << s;
      const mh = m >> 1;

      for (let k = 0; k < n; k += m) {
        for (let j = 0; j < mh; j++) {
          const idx = (j * n) / m;
          const wr = this.cosTable[idx];
          const wi = this.sinTable[idx];

          const tp_r = real[k + j + mh] * wr - imag[k + j + mh] * wi;
          const tp_i = real[k + j + mh] * wi + imag[k + j + mh] * wr;

          real[k + j + mh] = real[k + j] - tp_r;
          imag[k + j + mh] = imag[k + j] - tp_i;
          real[k + j] = real[k + j] + tp_r;
          imag[k + j] = imag[k + j] + tp_i;
        }
      }
    }
  }

  private reverseBits(x: number, bits: number): number {
    let result = 0;
    for (let i = 0; i < bits; i++) {
      result = (result << 1) | (x & 1);
      x >>= 1;
    }
    return result;
  }
}

// ============= REVERB ENGINE (SCHROEDER REVERBERATOR) =============

class ReverbEngine {
  private combFilters: CombFilter[];
  private allpassFilters: AllpassFilter[];
  private wetBuffer: Float32Array;

  constructor(sampleRate: number, settings: ReverbSettings) {
    // Schroeder reverberator: 4 parallel comb filters + 2 series allpass
    const combTimes = [1116, 1188, 1277, 1356].map((t) =>
      Math.floor((t / 44100) * sampleRate)
    );
    const allpassTimes = [225, 556].map((t) =>
      Math.floor((t / 44100) * sampleRate)
    );

    this.combFilters = combTimes.map(
      (time) => new CombFilter(time, settings.damping)
    );
    this.allpassFilters = allpassTimes.map(
      (time) => new AllpassFilter(time, 0.5)
    );
    this.wetBuffer = new Float32Array(combTimes[0]);
  }

  process(input: Float32Array, settings: ReverbSettings): Float32Array {
    const output = new Float32Array(input.length);

    for (let i = 0; i < input.length; i++) {
      // Parallel comb filters
      let combOutput = 0;
      for (const combFilter of this.combFilters) {
        combOutput += combFilter.process(input[i]);
      }

      // Series allpass filters
      let signal = combOutput;
      for (const allpassFilter of this.allpassFilters) {
        signal = allpassFilter.process(signal);
      }

      // Mix wet and dry
      output[i] =
        input[i] * settings.dryLevel + signal * settings.wetLevel;
    }

    return output;
  }
}

class CombFilter {
  private buffer: Float32Array;
  private index: number;
  private filterStore: number;
  private feedback: number;
  private damp1: number;
  private damp2: number;

  constructor(bufferSize: number, damping: number) {
    this.buffer = new Float32Array(bufferSize);
    this.index = 0;
    this.filterStore = 0;
    this.feedback = 0.84;
    this.damp1 = damping * 0.4;
    this.damp2 = (1 - damping) * 0.4;
  }

  process(input: number): number {
    const bufferOut = this.buffer[this.index];
    this.filterStore =
      bufferOut * this.damp2 + this.filterStore * this.damp1;
    this.buffer[this.index] =
      input + this.filterStore * this.feedback;

    this.index = (this.index + 1) % this.buffer.length;
    return bufferOut;
  }
}

class AllpassFilter {
  private buffer: Float32Array;
  private index: number;
  private feedback: number;

  constructor(bufferSize: number, feedback: number) {
    this.buffer = new Float32Array(bufferSize);
    this.index = 0;
    this.feedback = feedback;
  }

  process(input: number): number {
    const bufferOut = this.buffer[this.index];
    const output = -input + bufferOut;
    this.buffer[this.index] = input + bufferOut * this.feedback;

    this.index = (this.index + 1) % this.buffer.length;
    return output;
  }
}

// ============= BIQUAD FILTER (FOR EQ) =============

class BiquadFilter {
  private b0: number;
  private b1: number;
  private b2: number;
  private a1: number;
  private a2: number;
  private x1: number;
  private x2: number;
  private y1: number;
  private y2: number;

  constructor(
    frequency: number,
    sampleRate: number,
    Q: number,
    gain: number,
    type: string
  ) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;

    const w0 = (2 * Math.PI * frequency) / sampleRate;
    const sinW0 = Math.sin(w0);
    const cosW0 = Math.cos(w0);
    const alpha = sinW0 / (2 * Q);
    const A = Math.sqrt(Math.pow(10, gain / 40));

    switch (type) {
      case 'peaking':
        this.b0 = 1 + alpha * A;
        this.b1 = -2 * cosW0;
        this.b2 = 1 - alpha * A;
        this.a1 = -2 * cosW0;
        this.a2 = 1 - alpha / A;
        break;
      case 'lowpass':
        this.b0 = (1 - cosW0) / 2;
        this.b1 = 1 - cosW0;
        this.b2 = (1 - cosW0) / 2;
        this.a1 = -2 * cosW0;
        this.a2 = 1 - alpha;
        break;
      case 'highpass':
        this.b0 = (1 + cosW0) / 2;
        this.b1 = -(1 + cosW0);
        this.b2 = (1 + cosW0) / 2;
        this.a1 = -2 * cosW0;
        this.a2 = 1 - alpha;
        break;
      default:
        this.b0 = 1;
        this.b1 = this.b2 = this.a1 = this.a2 = 0;
    }

    // Normalize
    const a0 = 1 + this.a2;
    this.b0 /= a0;
    this.b1 /= a0;
    this.b2 /= a0;
    this.a1 /= a0;
    this.a2 /= a0;
  }

  process(sample: number): number {
    const output =
      this.b0 * sample +
      this.b1 * this.x1 +
      this.b2 * this.x2 -
      this.a1 * this.y1 -
      this.a2 * this.y2;

    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = output;

    return output;
  }
}

// ============= COMPRESSOR =============

class CompressorDSP {
  private envelope: number;

  constructor() {
    this.envelope = 0;
  }

  process(
    input: Float32Array,
    settings: CompressorSettings
  ): Float32Array {
    const output = new Float32Array(input.length);
    const thresholdLinear = Math.pow(10, settings.threshold / 20);
    const makeupGain = Math.pow(10, settings.makeup / 20);

    for (let i = 0; i < input.length; i++) {
      const inputLevel = Math.abs(input[i]);

      // Attack/Release envelope
      const targetEnvelope = Math.max(this.envelope, inputLevel);
      const coefficient =
        inputLevel > this.envelope
          ? Math.pow(0.1, 1 / (44100 * (settings.attack / 1000)))
          : Math.pow(0.1, 1 / (44100 * (settings.release / 1000)));

      this.envelope =
        targetEnvelope * coefficient + this.envelope * (1 - coefficient);

      // Gain reduction
      let gainReduction = 1;
      if (this.envelope > thresholdLinear) {
        const overshoot = this.envelope / thresholdLinear;
        gainReduction =
          Math.pow(overshoot, 1 / settings.ratio - 1) / overshoot;
      }

      output[i] = input[i] * gainReduction * makeupGain;
    }

    return output;
  }
}

// ============= LIMITER (PEAK DETECTION) =============

class Limiter {
  process(input: Float32Array, thresholdDb: number): Float32Array {
    const output = new Float32Array(input.length);
    const threshold = Math.pow(10, thresholdDb / 20);

    for (let i = 0; i < input.length; i++) {
      const level = Math.abs(input[i]);
      if (level > threshold) {
        output[i] = (input[i] / level) * threshold;
      } else {
        output[i] = input[i];
      }
    }

    return output;
  }
}

// ============= PUBLIC API =============

export async function applyTimeStretch(
  buffer: AudioBufferType,
  settings: TimeStretchSettings,
  progressCallback?: (progress: ProcessingProgress) => void
): Promise<AudioBufferType> {
  const vocoder = new PhaseVocoder(settings.windowSize);
  const startTime = performance.now();

  const processedChannels = await vocoder.process(
    buffer.data,
    1 / settings.rate,
    settings.preservePitch
  );

  if (progressCallback) {
    progressCallback({
      percentage: 100,
      stage: 'time-stretch',
      elapsedTime: (performance.now() - startTime) / 1000,
      estimatedRemaining: 0,
    });
  }

  return {
    data: processedChannels,
    format: {
      ...buffer.format,
      duration:
        buffer.format.duration /
        settings.rate,
    },
    metadata: buffer.metadata,
  };
}

export async function applyReverb(
  buffer: AudioBufferType,
  settings: ReverbSettings
): Promise<AudioBufferType> {
  const reverb = new ReverbEngine(buffer.format.sampleRate, settings);

  const processedChannels = buffer.data.map((channel) =>
    reverb.process(channel, settings)
  );

  return {
    data: processedChannels,
    format: buffer.format,
    metadata: buffer.metadata,
  };
}

export async function applyEqualizer(
  buffer: AudioBufferType,
  settings: EqualizerSettings
): Promise<AudioBufferType> {
  if (!settings.enabled) return buffer;

  const filters = settings.bands.map(
    (band) =>
      new BiquadFilter(
        band.frequency,
        buffer.format.sampleRate,
        band.Q,
        band.gain,
        band.type
      )
  );

  const processedChannels = buffer.data.map((channel) => {
    let processed = new Float32Array(channel);
    for (const filter of filters) {
      processed = processed.map((sample) => filter.process(sample));
    }
    return processed;
  });

  return {
    data: processedChannels,
    format: buffer.format,
    metadata: buffer.metadata,
  };
}

export async function applyCompressor(
  buffer: AudioBufferType,
  settings: CompressorSettings
): Promise<AudioBufferType> {
  if (!settings.enabled) return buffer;

  const compressor = new CompressorDSP();

  const processedChannels = buffer.data.map((channel) =>
    compressor.process(channel, settings)
  );

  return {
    data: processedChannels,
    format: buffer.format,
    metadata: buffer.metadata,
  };
}

export function createLimiter(thresholdDb: number) {
  const limiter = new Limiter();
  return (input: Float32Array) => limiter.process(input, thresholdDb);
}

export async function processEffects(
  buffer: AudioBufferType,
  config: EffectsConfig,
  progressCallback?: (progress: ProcessingProgress) => void
): Promise<AudioBufferType> {
  let result = buffer;

  // Apply effects in order
  const steps = [
    {
      name: 'time-stretch',
      fn: () => applyTimeStretch(result, config.timeStretch, progressCallback),
    },
    { name: 'reverb', fn: () => applyReverb(result, config.reverb) },
    {
      name: 'equalizer',
      fn: () => applyEqualizer(result, config.equalizer),
    },
    {
      name: 'compressor',
      fn: () => applyCompressor(result, config.compressor),
    },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (progressCallback) {
      progressCallback({
        percentage: (i / steps.length) * 100,
        stage: step.name,
        elapsedTime: 0,
        estimatedRemaining: 0,
      });
    }
    result = await step.fn();
  }

  // Apply limiter
  const limiter = createLimiter(config.limiterThreshold);
  const limitedChannels = result.data.map((channel) => limiter(channel));
  result = {
    ...result,
    data: limitedChannels,
  };

  if (progressCallback) {
    progressCallback({
      percentage: 100,
      stage: 'complete',
      elapsedTime: 0,
      estimatedRemaining: 0,
    });
  }

  return result;
}

export async function analyzeAudio(
  buffer: AudioBufferType,
  options?: AnalysisOptions
): Promise<AudioAnalysis> {
  const mixedChannel = new Float32Array(buffer.data[0].length);
  for (let i = 0; i < buffer.data[0].length; i++) {
    let sum = 0;
    for (const channel of buffer.data) {
      sum += channel[i];
    }
    mixedChannel[i] = sum / buffer.data.length;
  }

  // Peak level
  let peak = 0;
  let sum = 0;
  for (const sample of mixedChannel) {
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    sum += sample * sample;
  }

  const rms = Math.sqrt(sum / mixedChannel.length);
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-10));
  const rmsDb = 20 * Math.log10(Math.max(rms, 1e-10));

  return {
    peakLevel: peakDb,
    rmsLevel: rmsDb,
    dynamicRange: peakDb - rmsDb,
    crestFactor: peak / rms,
    frequency: {
      spectrum: new Float32Array(),
      centroid: 1000,
    },
    perceptual: {
      loudness: -23, // Placeholder LUFS
      loudnessRange: 5,
    },
  };
}
