/**
 * VPIN — Volume-Synchronized Probability of Informed Trading (Model §3)
 *
 * Fibonacci parameters:
 *   V_bucket divisor = 55  (was 50)
 *   nBuckets default = 55  (was 50)
 *   sigmaMult default = 2.0 (swing mode: 1.5)
 */

/** Standard normal CDF */
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function std(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(arr.length - 1, 1));
}

const BUCKET_DIVISOR = 55;  // Fib (was 50)

/**
 * Compute VPIN over a rolling window of volume buckets.
 *
 * @param {Array}  bars       [{date, close, volume}]
 * @param {number} nBuckets   rolling window size — default 55 (Fib)
 * @param {number} sigmaMult  toxic threshold = μ + sigmaMult×σ
 *                            1.5 for swing trades, 2.0 for HFT
 */
export function computeVPIN(bars, nBuckets = 55, sigmaMult = 2.0) {
  if (bars.length < 10) return { vpinSeries: [], isToxic: false, stats: {} };

  const volumes = bars.map(b => b.volume);
  const vBucket = median(volumes) / BUCKET_DIVISOR;

  // BVC classification
  const sigma = std(bars.slice(1).map((b, i) => b.close / bars[i].close - 1));
  const classified = bars.map((b, i) => {
    if (i === 0) return { ...b, vBuy: b.volume / 2, vSell: b.volume / 2 };
    const ret = b.close / bars[i - 1].close - 1;
    const z   = sigma > 0 ? ret / sigma : 0;
    const vBuy = b.volume * phi(z);
    return { ...b, vBuy, vSell: b.volume - vBuy };
  });

  // Fill volume buckets
  const buckets = [];
  let bucketBuy  = 0;
  let bucketSell = 0;
  let bucketFill = 0;

  for (const bar of classified) {
    let rem_v    = bar.volume;
    let rem_buy  = bar.vBuy;
    let rem_sell = bar.vSell;

    while (rem_v > 0) {
      const need     = vBucket - bucketFill;
      const take     = Math.min(need, rem_v);
      const fraction = bar.volume > 0 ? take / bar.volume : 0;

      bucketBuy  += rem_buy  * fraction;
      bucketSell += rem_sell * fraction;
      bucketFill += take;
      rem_v      -= take;
      rem_buy    -= rem_buy  * fraction;
      rem_sell   -= rem_sell * fraction;

      if (bucketFill >= vBucket * 0.99) {
        buckets.push({
          date:      bar.date,
          imbalance: Math.abs(bucketBuy - bucketSell) / vBucket,
        });
        bucketBuy = bucketSell = bucketFill = 0;
      }
    }
  }

  if (buckets.length < nBuckets) nBuckets = Math.max(5, Math.floor(buckets.length / 2));

  // Rolling VPIN
  const vpinSeries = [];
  for (let i = nBuckets - 1; i < buckets.length; i++) {
    const window = buckets.slice(i - nBuckets + 1, i + 1);
    const vpin   = window.reduce((a, b) => a + b.imbalance, 0) / nBuckets;
    vpinSeries.push({ date: buckets[i].date, vpin });
  }

  const vpinVals      = vpinSeries.map(x => x.vpin);
  const mu            = mean(vpinVals);
  const sigma2        = std(vpinVals);
  const toxicThreshold = mu + sigmaMult * sigma2;
  const current        = vpinVals[vpinVals.length - 1] ?? 0;
  const isToxic        = current > toxicThreshold;

  return {
    vpinSeries,
    toxicThreshold,
    isToxic,
    stats: { current, mu, sigma: sigma2, toxicThreshold },
  };
}
