/**
 * Order Flow Imbalance — Model §1
 *
 * Since OHLCV data doesn't include a real limit order book,
 * we approximate order flow using Bulk Volume Classification (BVC):
 *
 *   V_buy(t)  = V(t) × Φ( (C(t) − C(t−1)) / σ_daily )
 *   V_sell(t) = V(t) − V_buy(t)
 *
 * where Φ is the standard normal CDF and σ_daily is the rolling
 * std-dev of daily returns (proxy for intraday tick noise).
 *
 * OFI(t) = Σ_k w_k (dBid_k − dAsk_k)
 *
 * For OHLCV bars, we use K rolling lags as the "depth levels":
 *   dBid_k ≈ V_buy(t−k) × Δprice_bid_k
 *   dAsk_k ≈ V_sell(t−k) × Δprice_ask_k
 *
 * Depth decay: w_k = exp(−λk) / Σ exp(−λj)  [λ = 0.5]
 */

const LAMBDA = 0.5;
const K_LEVELS = 5; // number of depth levels / lags

/** Standard normal CDF (rational approximation) */
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

/** Rolling std-dev of returns over window */
function rollingStd(returns, i, window = 20) {
  const slice = returns.slice(Math.max(0, i - window), i + 1);
  if (slice.length < 2) return 1e-8;
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1);
  return Math.sqrt(variance) || 1e-8;
}

/** Depth-decay weights */
function depthWeights(k = K_LEVELS) {
  const raw = Array.from({ length: k }, (_, i) => Math.exp(-LAMBDA * (i + 1)));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(w => w / sum);
}

/**
 * Compute OFI time series from OHLCV bars.
 * @param {Array} bars  [{close, volume, ...}]
 * @returns {Array<{date, ofi, ofiNorm, vBuy, vSell}>}
 */
export function computeOFI(bars) {
  const n = bars.length;
  const returns = bars.map((b, i) =>
    i === 0 ? 0 : (b.close - bars[i - 1].close) / bars[i - 1].close
  );

  // BVC buy/sell volume classification
  const vBuy = bars.map((b, i) => {
    if (i === 0) return b.volume / 2;
    const sigma = rollingStd(returns, i - 1);
    const z = returns[i] / sigma;
    return b.volume * phi(z);
  });
  const vSell = bars.map((b, i) => b.volume - vBuy[i]);

  const weights = depthWeights(K_LEVELS);
  const ofiSeries = [];

  for (let t = K_LEVELS; t < n; t++) {
    let ofi = 0;
    for (let k = 0; k < K_LEVELS; k++) {
      const idx = t - k;
      // dBid: positive when price held/rose (buyers absorbed)
      const priceDelta = bars[idx].close - bars[idx - 1].close;
      const dBid = priceDelta >= 0
        ? vBuy[idx]
        : -vBuy[idx - 1];
      // dAsk: mirror for sell pressure
      const dAsk = priceDelta <= 0
        ? vSell[idx]
        : -vSell[idx - 1];

      ofi += weights[k] * (dBid - dAsk);
    }
    ofiSeries.push({
      date: bars[t].date,
      ofi,
      vBuy: vBuy[t],
      vSell: vSell[t],
      buyRatio: vBuy[t] / bars[t].volume,
    });
  }

  // Normalize OFI to [-1, 1]
  const ofiVals = ofiSeries.map(x => x.ofi);
  const maxAbs = Math.max(...ofiVals.map(Math.abs)) || 1;
  ofiSeries.forEach(x => { x.ofiNorm = x.ofi / maxAbs; });

  return ofiSeries;
}

/** Latest OFI signal summary */
export function ofiSignal(ofiBars) {
  if (!ofiBars.length) return null;
  const last = ofiBars[ofiBars.length - 1];
  const prev5 = ofiBars.slice(-5);
  const avgNorm = prev5.reduce((a, b) => a + b.ofiNorm, 0) / prev5.length;

  return {
    current: last.ofiNorm,
    avg5: avgNorm,
    buyRatio: last.buyRatio,
    direction: last.ofiNorm > 0.1 ? 'BUY PRESSURE' : last.ofiNorm < -0.1 ? 'SELL PRESSURE' : 'NEUTRAL',
  };
}
