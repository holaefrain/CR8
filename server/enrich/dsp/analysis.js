import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const MusicTempo = require('music-tempo');

// ── FFT (Cooley-Tukey radix-2) ─────────────────────────────────────────────
function fft(real, imag) {
  const n = real.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  // Butterfly passes
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wCosBase = Math.cos(ang);
    const wSinBase = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wCos = 1, wSin = 0;
      for (let j = 0; j < len / 2; j++) {
        const uR = real[i + j], uI = imag[i + j];
        const vR = real[i + j + len / 2] * wCos - imag[i + j + len / 2] * wSin;
        const vI = real[i + j + len / 2] * wSin + imag[i + j + len / 2] * wCos;
        real[i + j] = uR + vR;
        imag[i + j] = uI + vI;
        real[i + j + len / 2] = uR - vR;
        imag[i + j + len / 2] = uI - vI;
        const newWCos = wCos * wCosBase - wSin * wSinBase;
        wSin = wCos * wSinBase + wSin * wCosBase;
        wCos = newWCos;
      }
    }
  }
}

// ── Chromagram ─────────────────────────────────────────────────────────────
function computeChromagram(samples, sampleRate) {
  const frameSize = 4096;
  const hopSize = 2048;
  const chroma = new Float32Array(12).fill(0);

  // Precompute Hann window
  const hann = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (frameSize - 1)));
  }

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const real = new Float32Array(frameSize);
    const imag = new Float32Array(frameSize).fill(0);
    for (let i = 0; i < frameSize; i++) {
      real[i] = samples[start + i] * hann[i];
    }

    fft(real, imag);

    // Map FFT bins to 12 chroma classes (C2–B6: ~65 Hz – ~2000 Hz)
    for (let k = 1; k < frameSize / 2; k++) {
      const freq = k * sampleRate / frameSize;
      if (freq < 65 || freq > 2000) continue;
      const midi = Math.round(12 * Math.log2(freq / 440) + 69);
      const c = ((midi % 12) + 12) % 12;
      const mag = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
      chroma[c] += mag;
    }
  }

  // Normalize to [0, 1]
  const max = Math.max(...chroma);
  if (max > 0) for (let i = 0; i < 12; i++) chroma[i] /= max;
  return chroma;
}

// ── Key detection (Krumhansl-Schmuckler) ───────────────────────────────────
export function detectKey(samples, sampleRate) {
  // Krumhansl-Kessler tonal hierarchy profiles
  const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const NOTE_NAMES  = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const chroma = computeChromagram(samples, sampleRate);

  function pearson(a, b) {
    const n = a.length;
    const meanA = a.reduce((s, v) => s + v, 0) / n;
    const meanB = b.reduce((s, v) => s + v, 0) / n;
    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - meanA, db = b[i] - meanB;
      num += da * db;
      denA += da * da;
      denB += db * db;
    }
    return num / (Math.sqrt(denA * denB) + 1e-10);
  }

  let bestCorr = -Infinity, bestKey = '';
  for (let root = 0; root < 12; root++) {
    const majorRot = [...majorProfile.slice(root), ...majorProfile.slice(0, root)];
    const minorRot = [...minorProfile.slice(root), ...minorProfile.slice(0, root)];
    const chromaArr = Array.from(chroma);

    const mj = pearson(chromaArr, majorRot);
    const mn = pearson(chromaArr, minorRot);

    if (mj > bestCorr) { bestCorr = mj; bestKey = `${NOTE_NAMES[root]} major`; }
    if (mn > bestCorr) { bestCorr = mn; bestKey = `${NOTE_NAMES[root]} minor`; }
  }

  return bestKey;
}

// ── Public: PCM samples → { bpm, key } ────────────────────────────────────
export function analyzeSamples(samples, sampleRate) {
  const mt = new MusicTempo(samples);
  return { bpm: Math.round(mt.tempo), key: detectKey(samples, sampleRate) };
}
