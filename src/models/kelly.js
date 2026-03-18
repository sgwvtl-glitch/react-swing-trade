/**
 * Fractional Kelly Position Sizing — Model §5 & §6
 *
 * Fibonacci parameters:
 *   Bayesian lookback  = 34  (was 30)
 *   Heston short window = 34  (was 30)
 *   Heston long window  = 89  (was 90)
 *   Spread window       = 55  (was 50)
 */

const GAMMA           = 0.33;
const KELLY_LOOKBACK  = 34;   // Fib (was 30)
const HESTON_SHORT    = 34;   // Fib (was 30)
const HESTON_LONG     = 89;   // Fib (was 90)
const SPREAD_WINDOW   = 55;   // Fib (was 50)

function returns(bars) {
  return bars.slice(1).map((b, i) => b.close / bars[i].close - 1);
}

/**
 * Bayesian posterior P(up) — Beta(2+ups, 2+downs) prior
 * Lookback = 34 bars (Fib)
 */
function bayesianProbUp(rets, lookback = KELLY_LOOKBACK) {
  const window = rets.slice(-lookback);
  const ups    = window.filter(r => r > 0).length;
  const downs  = window.length - ups;
  const alpha  = 2 + ups;
  const beta   = 2 + downs;
  return alpha / (alpha + beta);
}

/**
 * Heston vol via method-of-moments
 * Short window = 34 (Fib), long window = 89 (Fib)
 */
function estimateHestonVol(bars) {
  const rets    = returns(bars);
  const win34   = rets.slice(-HESTON_SHORT);
  const n       = win34.length;
  if (n < 5) return { kappa: 2, theta: 0.04, xi: 0.3, annualVol: 0.2, dailyVol: 0.013, rho: -0.7 };

  const mean34  = win34.reduce((a, b) => a + b, 0) / n;
  const var34   = win34.reduce((a, b) => a + (b - mean34) ** 2, 0) / (n - 1);
  const annualVol = Math.sqrt(var34 * 252);

  const win89   = rets.slice(-HESTON_LONG);
  const mean89  = win89.reduce((a, b) => a + b, 0) / win89.length;
  const var89   = win89.reduce((a, b) => a + (b - mean89) ** 2, 0) / (win89.length - 1);
  const theta   = var89 * 252;

  return {
    kappa:      2.0,
    theta:      Math.max(theta, 0.01),
    xi:         0.3,
    currentVol: annualVol,
    annualVol,
    dailyVol:   Math.sqrt(var34),
    rho:        -0.7,
  };
}

/**
 * Spread decomposition — Roll's model
 * Window = 55 bars (Fib, was 50)
 */
function spreadDecomposition(bars) {
  const rets = returns(bars).slice(-SPREAD_WINDOW);
  if (rets.length < 10) return { adverseFraction: 0.5, isInformedFlow: false };

  let cov = 0;
  for (let i = 1; i < rets.length; i++) cov += rets[i] * rets[i - 1];
  cov /= rets.length - 1;

  const rollSpread = cov < 0 ? 2 * Math.sqrt(-cov) : 0;
  const avgHL      = bars.slice(-SPREAD_WINDOW)
    .reduce((a, b) => a + (b.high - b.low) / b.close, 0) / SPREAD_WINDOW;

  const adverseFraction = avgHL > 0
    ? Math.min(1, Math.max(0, (avgHL - rollSpread) / avgHL))
    : 0.5;

  return {
    adverseFraction,
    rollSpread,
    effectiveSpread: avgHL,
    isInformedFlow: adverseFraction > 0.6,
  };
}

/**
 * Compute fractional Kelly sizing.
 * @param {Array} bars [{close, high, low, volume}]
 */
export function computeKelly(bars) {
  if (bars.length < 21) return null;

  const rets = returns(bars);
  const p    = bayesianProbUp(rets);
  const q    = 1 - p;

  const upRets   = rets.filter(r => r > 0);
  const downRets = rets.filter(r => r < 0);

  const avgUp   = upRets.length   ? upRets.reduce((a, b) => a + b, 0)   / upRets.length   : 0.01;
  const avgDown = downRets.length ? Math.abs(downRets.reduce((a, b) => a + b, 0) / downRets.length) : 0.01;

  const b      = avgDown > 0 ? avgUp / avgDown : 1;
  const fFull  = (p * b - q) / b;
  const fAdj   = GAMMA * Math.max(fFull, 0);

  const volParams = estimateHestonVol(bars);
  const spread    = spreadDecomposition(bars);

  return {
    p, q, b,
    fFull:  Math.max(fFull, 0),
    fAdj,
    gamma:  GAMMA,
    expectedGrowth: fAdj * (p * Math.log(1 + b) + q * Math.log(Math.max(1 - fAdj, 1e-9))),
    vol:    volParams,
    spread,
    recommendation: fAdj < 0.01  ? 'NO EDGE — FLAT'
                  : fAdj < 0.05  ? 'SMALL POSITION'
                  : fAdj < 0.15  ? 'MODERATE POSITION'
                  : 'FULL KELLY ALLOCATION',
  };
}
