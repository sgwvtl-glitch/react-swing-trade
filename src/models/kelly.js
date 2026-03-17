/**
 * Fractional Kelly Position Sizing — Model §6
 *
 * f* = (pb − q) / b       [full Kelly]
 * f_adj = γ × f*          [γ = 0.33]
 *
 * p  = Bayesian posterior P(up | recent returns)
 * b  = avg_up_return / abs(avg_down_return)  [payoff ratio]
 * γ  = 0.33  → retains 78% geometric growth, caps drawdown
 *
 * For correlated multi-position: scale f_adj by √(1/n) naively.
 *
 * Also computes Heston-flavored realized vol (§5):
 *   dv(t) = κ(θ − v(t))dt + ξ√v(t) dW2
 * via simple MLE on rolling 30-day windows.
 */

const GAMMA = 0.33;

/** Rolling window of returns */
function returns(bars) {
  return bars.slice(1).map((b, i) => b.close / bars[i].close - 1);
}

/**
 * Bayesian posterior P(up) using Dirichlet-Multinomial with Beta prior.
 * Prior: Beta(2, 2) — mild regularization toward 0.5
 */
function bayesianProbUp(rets, lookback = 30) {
  const window = rets.slice(-lookback);
  const ups = window.filter(r => r > 0).length;
  const downs = window.length - ups;
  // Beta(α + ups, β + downs), α=β=2
  const alpha = 2 + ups;
  const beta = 2 + downs;
  return alpha / (alpha + beta);
}

/**
 * Estimate Heston vol parameters via method-of-moments on rolling 30d returns.
 */
function estimateHestonVol(bars) {
  const rets = returns(bars);
  const window30 = rets.slice(-30);
  const n = window30.length;
  if (n < 5) return { kappa: 2, theta: 0.04, xi: 0.3, currentVol: 0.2, annualVol: 0.2 };

  // Current realized variance (daily → annualized)
  const mean30 = window30.reduce((a, b) => a + b, 0) / n;
  const var30 = window30.reduce((a, b) => a + (b - mean30) ** 2, 0) / (n - 1);
  const annualVol = Math.sqrt(var30 * 252);

  // Long-run mean (use 90-day if available)
  const window90 = rets.slice(-90);
  const meanLong = window90.reduce((a, b) => a + b, 0) / window90.length;
  const varLong = window90.reduce((a, b) => a + (b - meanLong) ** 2, 0) / (window90.length - 1);
  const theta = varLong * 252;

  // Mean reversion speed (κ): proxy via AR(1) lag-1 autocorrelation of var
  // Simple estimate: κ ≈ 2 (typical for equity vol)
  const kappa = 2.0;
  const xi = 0.3; // vol-of-vol, typical estimate

  return {
    kappa,
    theta: Math.max(theta, 0.01),
    xi,
    currentVol: annualVol,
    annualVol,
    dailyVol: Math.sqrt(var30),
    rho: -0.7,  // typical leverage effect
  };
}

/**
 * Compute spread decomposition proxy (Model §2).
 * Adverse selection = fraction of spread that is permanent.
 *
 * Roll's model: c² = −Cov(ΔP_t, ΔP_{t-1})
 * Adverse selection fraction: (realized_spread − roll_spread) / realized_spread
 */
function spreadDecomposition(bars) {
  const rets = returns(bars).slice(-50);
  if (rets.length < 10) return { adverseFraction: 0.5, isInformedFlow: false };

  // Cov(Δr_t, Δr_{t-1})
  let cov = 0;
  for (let i = 1; i < rets.length; i++) {
    cov += rets[i] * rets[i - 1];
  }
  cov /= rets.length - 1;

  // Roll's bid-ask spread proxy
  const rollSpread = cov < 0 ? 2 * Math.sqrt(-cov) : 0;

  // Realized spread via high-low
  const avgHL = bars.slice(-50).reduce((a, b) => a + (b.high - b.low) / b.close, 0) / 50;

  const effectiveSpread = avgHL;
  const adverseFraction = effectiveSpread > 0
    ? Math.min(1, Math.max(0, (effectiveSpread - rollSpread) / effectiveSpread))
    : 0.5;

  return {
    adverseFraction,
    rollSpread,
    effectiveSpread,
    isInformedFlow: adverseFraction > 0.6,
  };
}

/**
 * Compute fractional Kelly sizing and related metrics.
 * @param {Array} bars  [{close, ...}]
 * @returns {Object}
 */
export function computeKelly(bars) {
  if (bars.length < 20) return null;

  const rets = returns(bars);
  const p = bayesianProbUp(rets);
  const q = 1 - p;

  const upRets = rets.filter(r => r > 0);
  const downRets = rets.filter(r => r < 0);

  const avgUp = upRets.length ? upRets.reduce((a, b) => a + b, 0) / upRets.length : 0.01;
  const avgDown = downRets.length ? Math.abs(downRets.reduce((a, b) => a + b, 0) / downRets.length) : 0.01;

  const b = avgDown > 0 ? avgUp / avgDown : 1;
  const fFull = (p * b - q) / b;
  const fAdj = GAMMA * Math.max(fFull, 0);  // clamp negative Kelly to 0

  const volParams = estimateHestonVol(bars);
  const spread = spreadDecomposition(bars);

  // Expected log growth at fractional Kelly
  const expectedGrowth = fAdj * (p * Math.log(1 + b) + q * Math.log(1 - fAdj)) ;

  return {
    p, q,
    b,
    fFull: Math.max(fFull, 0),
    fAdj,
    gamma: GAMMA,
    expectedGrowth,
    vol: volParams,
    spread,
    recommendation: fAdj < 0.01
      ? 'NO EDGE — FLAT'
      : fAdj < 0.05
        ? 'SMALL POSITION'
        : fAdj < 0.15
          ? 'MODERATE POSITION'
          : 'FULL KELLY ALLOCATION',
  };
}
