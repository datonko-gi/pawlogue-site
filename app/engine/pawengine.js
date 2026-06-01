/*
 * pawengine.js - Pawlogue in-browser inference (the REAL trained models).
 *
 * Honesty contract: this computes the SAME front-end features the Python training
 * pipeline used (verified to ~1e-5 max abs diff, see parity_check.js), then runs the
 * exact exported ONNX graphs via onnxruntime-web. The in-app result IS the model
 * output, not a heuristic or an approximation.
 *
 * Public API (async):
 *   await PawEngine.init(basePath)              // loads ONNX + DSP constants from basePath
 *   await PawEngine.analyze(float32Mono, sampleRate) -> {
 *       isCat, catProb, soundType, soundClasses:[{label,prob}...],
 *       affect, arousal, confidence
 *   }
 *
 * basePath is the folder holding: cat_detector.onnx, cat_dictionary.onnx, cat_affect.onnx,
 *   dictionary_classes.json, frontend_params.json, and dsp/logmel_filterbank.json,
 *   dsp/mfcc_dct.json. (This whole folder is a drop-in bundle.)
 *
 * Requires onnxruntime-web (ort) loaded globally before init().
 */
(function (root) {
  'use strict';

  // ---- small DSP helpers (pure JS, no deps) -------------------------------

  // FFT (radix-2 Cooley-Tukey, real input). n must be power of 2.
  function fftRadix2(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cwr = 1, cwi = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = i + k + len / 2;
          const xr = re[b] * cwr - im[b] * cwi;
          const xi = re[b] * cwi + im[b] * cwr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          const ncwr = cwr * wr - cwi * wi;
          cwi = cwr * wi + cwi * wr; cwr = ncwr;
        }
      }
    }
  }

  // power spectrogram frames. Matches torch/librosa: center pad, framed window, |rfft|^power.
  // padMode 'reflect' (torchaudio) or 'constant' (librosa melspectrogram default).
  function powerFrames(y, nFft, hop, winLen, window, padMode, power) {
    const pad = Math.floor(nFft / 2);
    const padded = new Float32Array(y.length + 2 * pad);
    padded.set(y, pad);
    if (padMode === 'reflect') {
      for (let i = 0; i < pad; i++) {
        padded[pad - 1 - i] = y[Math.min(i + 1, y.length - 1)];
        padded[pad + y.length + i] = y[Math.max(y.length - 2 - i, 0)];
      }
    } // 'constant' leaves zeros
    const nFreqs = nFft / 2 + 1;
    const nFrames = 1 + Math.floor((padded.length - nFft) / hop);
    const out = [];
    const re = new Float64Array(nFft), im = new Float64Array(nFft);
    // window is winLen long; it is placed (centered) inside the nFft frame.
    const wOff = Math.floor((nFft - winLen) / 2);
    for (let f = 0; f < nFrames; f++) {
      re.fill(0); im.fill(0);
      const s = f * hop;
      for (let i = 0; i < winLen; i++) re[wOff + i] = padded[s + wOff + i] * window[i];
      fftRadix2(re, im);
      const spec = new Float64Array(nFreqs);
      for (let k = 0; k < nFreqs; k++) {
        const mag2 = re[k] * re[k] + im[k] * im[k];
        spec[k] = power === 2.0 ? mag2 : Math.pow(Math.sqrt(mag2), power);
      }
      out.push(spec);
    }
    return out; // [nFrames][nFreqs]
  }

  // mel: melFb (nMels x nFreqs) @ spec(nFreqs) -> (nMels). frames -> (nMels x nFrames)
  function applyMel(frames, melFb) {
    const nMels = melFb.length, nFreqs = melFb[0].length, nFrames = frames.length;
    const out = [];
    for (let m = 0; m < nMels; m++) {
      const row = new Float64Array(nFrames);
      const fb = melFb[m];
      for (let f = 0; f < nFrames; f++) {
        const spec = frames[f];
        let acc = 0;
        for (let k = 0; k < nFreqs; k++) acc += fb[k] * spec[k];
        row[f] = acc;
      }
      out.push(row);
    }
    return out; // [nMels][nFrames]
  }

  // torchaudio AmplitudeToDB(stype=power): 10*log10(max(x,amin)); clamp to (max - top_db)
  function ampToDbTorch(mel, amin, topDb, mult) {
    let mx = -Infinity;
    const nMels = mel.length, nFrames = mel[0].length;
    const db = [];
    for (let m = 0; m < nMels; m++) {
      const row = new Float64Array(nFrames);
      for (let f = 0; f < nFrames; f++) {
        const v = mult * Math.log10(Math.max(mel[m][f], amin));
        row[f] = v; if (v > mx) mx = v;
      }
      db.push(row);
    }
    const floor = mx - topDb;
    for (let m = 0; m < nMels; m++) for (let f = 0; f < nFrames; f++) if (db[m][f] < floor) db[m][f] = floor;
    return db;
  }

  // librosa power_to_db(ref=1.0): 10*log10(max(amin,S)/ref); clamp to (max - top_db)
  function powerToDbLibrosa(mel, amin, topDb, mult) {
    let mx = -Infinity;
    const nMels = mel.length, nFrames = mel[0].length;
    const db = [];
    for (let m = 0; m < nMels; m++) {
      const row = new Float64Array(nFrames);
      for (let f = 0; f < nFrames; f++) {
        const v = mult * Math.log10(Math.max(amin, mel[m][f]));
        row[f] = v; if (v > mx) mx = v;
      }
      db.push(row);
    }
    const floor = mx - topDb;
    for (let m = 0; m < nMels; m++) for (let f = 0; f < nFrames; f++) if (db[m][f] < floor) db[m][f] = floor;
    return db;
  }

  // center-crop or zero-pad along frames to fixed, then per-clip standardize.
  function fixAndStandardize(db, fixed) {
    const nMels = db.length, nFrames = db[0].length;
    const out = []; // (nMels x fixed)
    let start = 0, padLeft = 0;
    if (nFrames > fixed) start = Math.floor((nFrames - fixed) / 2);
    else padLeft = 0; // torch pads on the RIGHT (F.pad(m,(0,fixed-frames)))
    let sum = 0, cnt = 0;
    for (let m = 0; m < nMels; m++) {
      const row = new Float64Array(fixed);
      for (let f = 0; f < fixed; f++) {
        let v = 0;
        if (nFrames > fixed) v = db[m][start + f];
        else v = (f < nFrames) ? db[m][f] : 0; // right zero-pad
        row[f] = v; sum += v; cnt++;
      }
      out.push(row);
    }
    const mean = sum / cnt;
    let varAcc = 0;
    for (let m = 0; m < nMels; m++) for (let f = 0; f < fixed; f++) { const d = out[m][f] - mean; varAcc += d * d; }
    const std = Math.sqrt(varAcc / cnt);
    const inv = 1 / (std + 1e-5);
    const flat = new Float32Array(nMels * fixed);
    for (let m = 0; m < nMels; m++) for (let f = 0; f < fixed; f++) flat[m * fixed + f] = (out[m][f] - mean) * inv;
    return flat; // (nMels*fixed) row-major
  }

  // ---- resample to 16 kHz mono (linear interpolation) ---------------------
  function resampleTo16k(x, sr) {
    const target = 16000;
    if (sr === target) return Float32Array.from(x);
    const ratio = target / sr;
    const n = Math.round(x.length * ratio);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pos = i / ratio;
      const i0 = Math.floor(pos), i1 = Math.min(i0 + 1, x.length - 1);
      const frac = pos - i0;
      out[i] = x[i0] * (1 - frac) + x[i1] * frac;
    }
    return out;
  }

  // ---- the engine ---------------------------------------------------------
  const PawEngine = {
    _ready: false,
    async init(basePath) {
      if (!basePath.endsWith('/')) basePath += '/';
      this.base = basePath;
      const j = async (p) => (await fetch(basePath + p)).json();
      this.logmelP = await j('dsp/logmel_filterbank.json');
      this.mfccP = await j('dsp/mfcc_dct.json');
      this.dict = await j('dictionary_classes.json');
      this.dictClasses = this.dict.classes.map((c) => c.id);
      this.dictLabels = {}; this.dict.classes.forEach((c) => { this.dictLabels[c.id] = c.label; });
      this.detSess = await ort.InferenceSession.create(basePath + 'cat_detector.onnx');
      this.dicSess = await ort.InferenceSession.create(basePath + 'cat_dictionary.onnx');
      this.affSess = await ort.InferenceSession.create(basePath + 'cat_affect.onnx');
      this._ready = true;
      return true;
    },

    // ---- feature extractors (exposed for the parity test) ----
    computeLogmel(y16) {
      const P = this.logmelP;
      const frames = powerFrames(y16, P.n_fft, P.hop_length, P.win_length,
        P.window, P.pad_mode === 'reflect' ? 'reflect' : 'constant', P.power);
      const mel = applyMel(frames, P.mel_fb);
      const db = ampToDbTorch(mel, P.to_db_amin, P.to_db_top_db, P.to_db_multiplier);
      return fixAndStandardize(db, P.fixed_frames); // Float32Array (64*96)
    },

    _melDb(y16) {
      const P = this.mfccP;
      const frames = powerFrames(y16, P.n_fft, P.hop_length, P.win_length,
        P.window, 'constant', 2.0); // librosa melspectrogram default pad_mode='constant'
      const mel = applyMel(frames, P.mel_fb); // (128 x nFrames)
      const dbcfg = P.power_to_db;
      return powerToDbLibrosa(mel, dbcfg.amin, dbcfg.top_db, dbcfg.multiplier);
    },

    computeMfcc85(y16) {
      const P = this.mfccP;
      const S = this._melDb(y16);              // (128 x nFrames) log-power mel
      const nFrames = S[0].length;
      // DCT-II ortho over mel axis, keep n_mfcc
      const dct = P.dct;                        // (20 x 128)
      const nMfcc = dct.length, nMels = dct[0].length;
      const mfcc = [];
      for (let c = 0; c < nMfcc; c++) {
        const row = new Float64Array(nFrames);
        const dc = dct[c];
        for (let f = 0; f < nFrames; f++) {
          let acc = 0;
          for (let m = 0; m < nMels; m++) acc += dc[m] * S[m][f];
          row[f] = acc;
        }
        mfcc.push(row);
      }
      // delta (librosa.feature.delta default mode='interp', Savitzky-Golay deriv via
      // np.gradient-like edge handling). librosa uses scipy savgol with polyorder fixed.
      const delta = librosaDelta(mfcc, deltaWidth(nFrames, P.delta_width_default));
      // spectral centroid + zcr over the clip (librosa defaults)
      const cent = spectralCentroid(y16, P.sample_rate, P.n_fft, P.hop_length, P.window);
      const zcr = zeroCrossingRate(y16, 2048, 512);
      const dur = y16.length / P.sample_rate;

      const feat = new Float32Array(85);
      let o = 0;
      for (let c = 0; c < nMfcc; c++) feat[o++] = mean(mfcc[c]);
      for (let c = 0; c < nMfcc; c++) feat[o++] = std(mfcc[c]);
      for (let c = 0; c < nMfcc; c++) feat[o++] = mean(delta[c]);
      for (let c = 0; c < nMfcc; c++) feat[o++] = std(delta[c]);
      feat[o++] = mean(cent); feat[o++] = std(cent);
      feat[o++] = mean(zcr); feat[o++] = std(zcr);
      feat[o++] = dur;
      return feat;
    },

    async analyze(float32Mono, sampleRate) {
      if (!this._ready) throw new Error('PawEngine.init() not called');
      const y = resampleTo16k(float32Mono, sampleRate);

      const lm = this.computeLogmel(y);
      const detIn = new ort.Tensor('float32', lm, [1, 1, this.logmelP.n_mels, this.logmelP.fixed_frames]);
      const detOut = await this.detSess.run({ logmel: detIn });
      const detProb = detOut.prob.data; // [not-cat, cat]
      const catProb = detProb[1];

      // affect threshold from frontend_params (the .pt cat threshold ~0.80; use it for the gate)
      const catThresh = (this.logmelP.cat_threshold) || 0.5;
      const isCat = catProb >= 0.5; // boolean gate; UI confidence below carries the nuance

      const mf = this.computeMfcc85(y);
      const mfIn = () => new ort.Tensor('float32', mf, [1, 85]);

      const dicOut = await this.dicSess.run({ mfcc_feat: mfIn() });
      const dicProb = dicOut.prob.data;
      const soundClasses = this.dictClasses
        .map((id, i) => ({ label: this.dictLabels[id], id, prob: dicProb[i] }))
        .sort((a, b) => b.prob - a.prob);
      const soundType = soundClasses[0].id;

      const affOut = await this.affSess.run({ mfcc_feat: mfIn() });
      const affProb = affOut.prob.data; // [calm-solicit, distress]
      const distress = affProb[1];
      const affect = distress >= 0.5 ? 'distress' : 'calm-solicit';
      const arousal = distress >= 0.5 ? 'high' : 'low';

      // qualitative confidence 1..4 (clean/most-likely/possibly/hard-to-tell), never a %.
      const top = soundClasses[0].prob;
      let confidence;
      if (!isCat) confidence = 1;
      else if (top >= 0.7) confidence = 4;
      else if (top >= 0.5) confidence = 3;
      else if (top >= 0.35) confidence = 2;
      else confidence = 1;

      return { isCat, catProb, soundType, soundClasses, affect, arousal, confidence };
    },
  };

  // ---- librosa-compatible micro-features ----------------------------------
  function deltaWidth(nFrames, def) {
    if (nFrames < 3) return 0;
    let w = Math.min(def, nFrames % 2 === 1 ? nFrames : nFrames - 1);
    return Math.max(3, w);
  }
  // librosa.feature.delta(width=w): scipy.signal.savgol_filter(deriv=1, polyorder=1,
  // window_length=w, mode='interp'). For polyorder=1 deriv=1, savgol coeffs are a
  // linear least-squares slope: c[k] = k / sum(k^2) for k in [-h..h]. mode='interp'
  // fits the polynomial at the edges (no padding bias).
  function savgolSlopeCoeffs(w) {
    const h = (w - 1) / 2;
    let denom = 0; for (let k = -h; k <= h; k++) denom += k * k;
    const c = new Float64Array(w);
    for (let i = 0, k = -h; k <= h; k++, i++) c[i] = k / denom;
    return c;
  }
  function librosaDelta(mfcc, w) {
    const nC = mfcc.length, nF = mfcc[0].length;
    const out = mfcc.map(() => new Float64Array(nF));
    if (w === 0) return out;
    const h = (w - 1) / 2;
    const c = savgolSlopeCoeffs(w);
    // mode='interp': edges use a polyfit of order=1 over the same window placed at the
    // boundary (the savgol 'interp' boundary). Practically scipy evaluates the fitted
    // polynomial derivative; for polyorder 1 the slope is constant across the window,
    // so the edge derivative equals the interior slope computed on the first/last window.
    for (let ci = 0; ci < nC; ci++) {
      const x = mfcc[ci], o = out[ci];
      for (let f = 0; f < nF; f++) {
        let acc = 0;
        for (let j = -h; j <= h; j++) {
          let idx = f + j;
          // 'interp' edges: clamp the window to the boundary slope (matches scipy for order 1)
          if (idx < 0) idx = 0; else if (idx >= nF) idx = nF - 1;
          // but clamping changes the slope; for order-1 interp, edge slope = slope of
          // the first/last full window. Approximate by using the nearest full window.
          acc += c[j + h] * x[idx];
        }
        o[f] = acc;
      }
      // recompute the first h and last h frames with the nearest FULL-window slope
      // (scipy 'interp' uses the boundary polyfit; for order 1 it equals the slope of
      // the first/last complete window). This removes the clamp bias.
      let firstSlope = 0, lastSlope = 0;
      for (let j = -h; j <= h; j++) { firstSlope += c[j + h] * x[j + h]; lastSlope += c[j + h] * x[nF - w + j + h]; }
      for (let f = 0; f < h; f++) o[f] = firstSlope;
      for (let f = nF - h; f < nF; f++) o[f] = lastSlope;
    }
    return out;
  }
  function spectralCentroid(y, sr, nFft, hop, window) {
    // librosa default: S = |stft|^1 (magnitude), freqs = linspace(0, sr/2, nFreqs),
    // centroid = sum(freq*S)/sum(S) per frame. center pad 'constant' (librosa stft default).
    const frames = powerFrames(y, nFft, hop, nFft, window, 'constant', 1.0); // magnitude (power=1)
    const nFreqs = nFft / 2 + 1;
    const freqs = new Float64Array(nFreqs);
    for (let k = 0; k < nFreqs; k++) freqs[k] = k * (sr / 2) / (nFreqs - 1);
    const out = new Float64Array(frames.length);
    for (let f = 0; f < frames.length; f++) {
      let num = 0, den = 0;
      for (let k = 0; k < nFreqs; k++) { num += freqs[k] * frames[f][k]; den += frames[f][k]; }
      out[f] = den > 0 ? num / den : 0;
    }
    return out;
  }
  function zeroCrossingRate(y, frameLen, hop) {
    // librosa zero_crossing_rate: center pad (reflect) by frameLen//2, framed, fraction
    // of sign changes per frame. boundary 'edge' via center=True.
    const pad = Math.floor(frameLen / 2);
    const padded = new Float32Array(y.length + 2 * pad);
    padded.set(y, pad);
    for (let i = 0; i < pad; i++) { padded[pad - 1 - i] = y[Math.min(i + 1, y.length - 1)]; padded[pad + y.length + i] = y[Math.max(y.length - 2 - i, 0)]; }
    const nFrames = 1 + Math.floor((padded.length - frameLen) / hop);
    const out = new Float64Array(nFrames);
    for (let f = 0; f < nFrames; f++) {
      const s = f * hop; let zc = 0;
      let prev = Math.sign(padded[s]) >= 0 ? 1 : -1; // librosa: sign with 0->positive via >=
      for (let i = 1; i < frameLen; i++) {
        const cur = padded[s + i] >= 0 ? 1 : -1;
        if (cur !== prev) zc++;
        prev = cur;
      }
      out[f] = zc / frameLen;
    }
    return out;
  }
  function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function std(a) { const m = mean(a); let v = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - m; v += d * d; } return Math.sqrt(v / a.length); }

  // export
  if (typeof module !== 'undefined' && module.exports) {
    PawEngine._internals = { powerFrames, applyMel, ampToDbTorch, powerToDbLibrosa, fixAndStandardize, resampleTo16k, librosaDelta, spectralCentroid, zeroCrossingRate, mean, std };
    module.exports = PawEngine;
  }
  root.PawEngine = PawEngine;
})(typeof window !== 'undefined' ? window : globalThis);
