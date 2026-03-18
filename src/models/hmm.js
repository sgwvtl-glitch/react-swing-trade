/**
 * Hidden Markov Model — Regime Detection (Model §7)
 *
 * States: {TRENDING, MEAN_REVERTING, VOLATILE}
 *
 * Fibonacci parameters:
 *   Rolling return window  = 5   (Fib ✓)
 *   Rolling vol window     = 13  (Fib, was 10)
 *   Observation start      = 13  (Fib, was 10)
 *   State distribution     = 21  (Fib, was 20)
 */

const STATES = ['TRENDING', 'MEAN_REVERTING', 'VOLATILE'];
const RET_WIN = 5;   // Fib ✓
const VOL_WIN = 13;  // Fib (was 10)
const OBS_START = 13; // Fib (was 10)
const DIST_WIN = 21;  // Fib (was 20)

const PI = [0.33, 0.34, 0.33];

const A = [
  [0.70, 0.15, 0.15],
  [0.15, 0.70, 0.15],
  [0.10, 0.15, 0.75],
];

function gaussianPDF(x, mu, sigma) {
  if (sigma < 1e-10) return x === mu ? 1 : 1e-300;
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

function emissionProb(obs, stateParams) {
  const { mu1, sig1, mu2, sig2 } = stateParams;
  return gaussianPDF(obs[0], mu1, sig1) * gaussianPDF(obs[1], mu2, sig2);
}

function estimateEmissions(observations) {
  const rets = observations.map(o => o[0]);
  const vols = observations.map(o => o[1]);
  const retSorted = [...rets].sort((a, b) => a - b);
  const volSorted = [...vols].sort((a, b) => a - b);
  const ret33 = retSorted[Math.floor(retSorted.length * 0.33)];
  const ret66 = retSorted[Math.floor(retSorted.length * 0.66)];
  const vol66 = volSorted[Math.floor(volSorted.length * 0.66)];
  const vol33 = volSorted[Math.floor(volSorted.length * 0.33)];

  function statsByFilter(fn) {
    const subset = observations.filter(fn);
    if (!subset.length) return { mu1: 0, sig1: 0.01, mu2: 0.01, sig2: 0.01 };
    const r = subset.map(o => o[0]);
    const v = subset.map(o => o[1]);
    const mu1  = r.reduce((a, b) => a + b, 0) / r.length;
    const mu2  = v.reduce((a, b) => a + b, 0) / v.length;
    const sig1 = Math.sqrt(r.reduce((a, b) => a + (b - mu1) ** 2, 0) / r.length) || 0.01;
    const sig2 = Math.sqrt(v.reduce((a, b) => a + (b - mu2) ** 2, 0) / v.length) || 0.01;
    return { mu1, sig1, mu2, sig2 };
  }

  return [
    statsByFilter(o => Math.abs(o[0]) > ret66 && o[1] < vol66),  // TRENDING
    statsByFilter(o => Math.abs(o[0]) < ret33 && o[1] < vol33),  // MEAN_REVERTING
    statsByFilter(o => o[1] > vol66),                             // VOLATILE
  ];
}

function logSumExp(arr) {
  const max = Math.max(...arr);
  return max + Math.log(arr.reduce((s, x) => s + Math.exp(x - max), 0));
}

function viterbi(obs, B) {
  const T = obs.length;
  const N = STATES.length;
  const delta = Array.from({ length: T }, () => new Float64Array(N));
  const psi   = Array.from({ length: T }, () => new Int32Array(N));

  for (let j = 0; j < N; j++)
    delta[0][j] = Math.log(PI[j]) + Math.log(emissionProb(obs[0], B[j]) + 1e-300);

  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let best = -Infinity, bestI = 0;
      for (let i = 0; i < N; i++) {
        const v = delta[t - 1][i] + Math.log(A[i][j]);
        if (v > best) { best = v; bestI = i; }
      }
      delta[t][j] = best + Math.log(emissionProb(obs[t], B[j]) + 1e-300);
      psi[t][j]   = bestI;
    }
  }

  const path = new Array(T);
  path[T - 1] = delta[T - 1].indexOf(Math.max(...delta[T - 1]));
  for (let t = T - 2; t >= 0; t--) path[t] = psi[t + 1][path[t + 1]];
  return path;
}

/**
 * Compute regime path.
 * Observations: [rolling_5d_return, rolling_13d_vol]  (both Fib)
 */
export function computeRegimes(bars) {
  if (bars.length < OBS_START + 5) return null;

  const observations = [];
  const dates = [];

  for (let i = OBS_START; i < bars.length; i++) {
    const ret5 = (bars[i].close - bars[i - RET_WIN].close) / bars[i - RET_WIN].close;

    const win13 = bars.slice(i - VOL_WIN, i + 1)
      .map((b, j, arr) => j === 0 ? 0 : b.close / arr[j - 1].close - 1)
      .slice(1);
    const mean13 = win13.reduce((a, b) => a + b, 0) / win13.length;
    const vol13  = Math.sqrt(win13.reduce((a, b) => a + (b - mean13) ** 2, 0) / win13.length);

    observations.push([ret5, vol13]);
    dates.push(bars[i].date);
  }

  const B    = estimateEmissions(observations);
  const path = viterbi(observations, B);

  const regimeSeries  = path.map((s, i) => ({ date: dates[i], state: s, regime: STATES[s] }));
  const currentState  = path[path.length - 1];
  const currentRegime = STATES[currentState];

  const strategies = {
    TRENDING:       { overlay: 'MOMENTUM',       kellySizeMultiplier: 1.0  },
    MEAN_REVERTING: { overlay: 'CONTRARIAN OFI', kellySizeMultiplier: 0.75 },
    VOLATILE:       { overlay: 'REDUCE SIZE',    kellySizeMultiplier: 0.5  },
  };

  // State distribution over last 21 bars (Fib)
  const recent = path.slice(-DIST_WIN);
  const distribution = STATES.map((_, i) => ({
    regime:   STATES[i],
    fraction: recent.filter(s => s === i).length / recent.length,
  }));

  return { regimeSeries, currentRegime, currentState, strategy: strategies[currentRegime], distribution };
}
