/**
 * Hidden Markov Model — Regime Detection (Model §7)
 *
 * States: {TRENDING, MEAN_REVERTING, VOLATILE}
 *
 * Observations: [rolling_5d_return, rolling_10d_vol] normalized
 *
 * Forward algorithm: a_t(j) = Σ_i a_{t-1}(i) A[i,j] B[j](x_t)
 * Viterbi decode: S* = argmax_j a_T(j)
 *
 * Transition matrix and emission parameters are estimated from data,
 * with heuristic priors based on typical equity behavior.
 */

const STATES = ['TRENDING', 'MEAN_REVERTING', 'VOLATILE'];

// Initial state distribution (rough prior)
const PI = [0.33, 0.34, 0.33];

// Transition matrix A[from][to] — slightly sticky states
const A = [
  [0.70, 0.15, 0.15],   // TRENDING → ...
  [0.15, 0.70, 0.15],   // MEAN_REVERTING → ...
  [0.10, 0.15, 0.75],   // VOLATILE → ...
];

/** Gaussian PDF */
function gaussianPDF(x, mu, sigma) {
  if (sigma < 1e-10) return x === mu ? 1 : 1e-300;
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

/** Bivariate Gaussian (independent) emission */
function emissionProb(obs, stateParams) {
  const { mu1, sig1, mu2, sig2 } = stateParams;
  return gaussianPDF(obs[0], mu1, sig1) * gaussianPDF(obs[1], mu2, sig2);
}

/**
 * Estimate emission parameters from observed data.
 * Uses k-means style soft assignment based on return/vol percentile.
 */
function estimateEmissions(observations) {
  const rets = observations.map(o => o[0]);
  const vols = observations.map(o => o[1]);

  const retSorted = [...rets].sort((a, b) => a - b);
  const volSorted = [...vols].sort((a, b) => a - b);

  const ret33 = retSorted[Math.floor(retSorted.length * 0.33)];
  const ret66 = retSorted[Math.floor(retSorted.length * 0.66)];
  const vol33 = volSorted[Math.floor(volSorted.length * 0.33)];
  const vol66 = volSorted[Math.floor(volSorted.length * 0.66)];

  function statsByFilter(filterFn) {
    const subset = observations.filter(filterFn);
    if (!subset.length) return { mu1: 0, sig1: 0.01, mu2: 0.01, sig2: 0.01 };
    const r = subset.map(o => o[0]);
    const v = subset.map(o => o[1]);
    const mu1 = r.reduce((a, b) => a + b, 0) / r.length;
    const mu2 = v.reduce((a, b) => a + b, 0) / v.length;
    const sig1 = Math.sqrt(r.reduce((a, b) => a + (b - mu1) ** 2, 0) / r.length) || 0.01;
    const sig2 = Math.sqrt(v.reduce((a, b) => a + (b - mu2) ** 2, 0) / v.length) || 0.01;
    return { mu1, sig1, mu2, sig2 };
  }

  // TRENDING: high |return|, moderate vol
  const trending = statsByFilter(o => Math.abs(o[0]) > ret66 && o[1] < vol66);
  // MEAN_REVERTING: low |return|, low vol
  const meanRev = statsByFilter(o => Math.abs(o[0]) < ret33 && o[1] < vol33);
  // VOLATILE: any return, high vol
  const volatile_ = statsByFilter(o => o[1] > vol66);

  return [trending, meanRev, volatile_];
}

/** Log-sum-exp for numerical stability */
function logSumExp(arr) {
  const max = Math.max(...arr);
  return max + Math.log(arr.reduce((s, x) => s + Math.exp(x - max), 0));
}

/**
 * Forward HMM algorithm for sequence of observations.
 */
function forward(obs, B) {
  const T = obs.length;
  const N = STATES.length;
  const alpha = Array.from({ length: T }, () => new Float64Array(N));

  // Init
  for (let j = 0; j < N; j++) {
    alpha[0][j] = Math.log(PI[j]) + Math.log(emissionProb(obs[0], B[j]) + 1e-300);
  }

  // Recurse
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      const vals = Array.from({ length: N }, (_, i) => alpha[t - 1][i] + Math.log(A[i][j]));
      alpha[t][j] = logSumExp(vals) + Math.log(emissionProb(obs[t], B[j]) + 1e-300);
    }
  }

  return alpha;
}

/**
 * Viterbi decoding.
 */
function viterbi(obs, B) {
  const T = obs.length;
  const N = STATES.length;
  const delta = Array.from({ length: T }, () => new Float64Array(N));
  const psi = Array.from({ length: T }, () => new Int32Array(N));

  for (let j = 0; j < N; j++) {
    delta[0][j] = Math.log(PI[j]) + Math.log(emissionProb(obs[0], B[j]) + 1e-300);
  }

  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let best = -Infinity, bestI = 0;
      for (let i = 0; i < N; i++) {
        const v = delta[t - 1][i] + Math.log(A[i][j]);
        if (v > best) { best = v; bestI = i; }
      }
      delta[t][j] = best + Math.log(emissionProb(obs[t], B[j]) + 1e-300);
      psi[t][j] = bestI;
    }
  }

  // Backtrack
  const path = new Array(T);
  path[T - 1] = delta[T - 1].indexOf(Math.max(...delta[T - 1]));
  for (let t = T - 2; t >= 0; t--) {
    path[t] = psi[t + 1][path[t + 1]];
  }

  return path;
}

/**
 * Compute regime path for a bar series.
 * @param {Array} bars [{date, close, volume}]
 * @returns {{regimeSeries, currentRegime, strategy, kellySizeMultiplier}}
 */
export function computeRegimes(bars) {
  if (bars.length < 20) return null;

  // Build observations: [rolling_5d_return, rolling_10d_vol]
  const observations = [];
  const dates = [];

  for (let i = 10; i < bars.length; i++) {
    const ret5 = (bars[i].close - bars[i - 5].close) / bars[i - 5].close;
    const window10 = bars.slice(i - 10, i + 1).map((b, j, arr) =>
      j === 0 ? 0 : b.close / arr[j - 1].close - 1
    ).slice(1);
    const mean10 = window10.reduce((a, b) => a + b, 0) / window10.length;
    const vol10 = Math.sqrt(window10.reduce((a, b) => a + (b - mean10) ** 2, 0) / window10.length);
    observations.push([ret5, vol10]);
    dates.push(bars[i].date);
  }

  // Estimate emissions from data
  const B = estimateEmissions(observations);

  // Viterbi path
  const path = viterbi(observations, B);

  const regimeSeries = path.map((s, i) => ({
    date: dates[i],
    state: s,
    regime: STATES[s],
  }));

  const currentState = path[path.length - 1];
  const currentRegime = STATES[currentState];

  // Strategy overlay per regime (Model §7)
  const strategies = {
    TRENDING:        { overlay: 'MOMENTUM',         kellySizeMultiplier: 1.0  },
    MEAN_REVERTING:  { overlay: 'CONTRARIAN OFI',   kellySizeMultiplier: 0.75 },
    VOLATILE:        { overlay: 'REDUCE SIZE',       kellySizeMultiplier: 0.5  },
  };

  const strategy = strategies[currentRegime];

  // State distribution (last 20 bars)
  const recent = path.slice(-20);
  const dist = STATES.map((_, i) => ({
    regime: STATES[i],
    fraction: recent.filter(s => s === i).length / recent.length,
  }));

  return {
    regimeSeries,
    currentRegime,
    currentState,
    strategy,
    distribution: dist,
  };
}
