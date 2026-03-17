/**
 * VPIN — Volume-Synchronized Probability of Informed Trading (Model §3)
 *
 * VPIN = (1/n) Σ |V_buy(t) − V_sell(t)| / V_bucket
 *
 * Bucket size: V_bucket = median(daily_volume) / 50
 * Toxic flow: VPIN > μ_VPIN + 2σ_VPIN
 *
 * Buy/Sell classification via Bulk Volume Classification (BVC):
 *   V_buy(t)  = V(t) × Φ(ΔP(t) / σ(t))
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

/**
 * Compute VPIN over a rolling window of volume buckets.
 * @param {Array} bars  [{date, close, volume}]
 * @param {number} nBuckets  number of buckets in rolling window (default 50)
 * @returns {{vpinSeries, toxicThreshold, isToxic, stats}}
 */
export function computeVPIN(bars, nBuckets = 50, sigmaMult = 2.0) {
  if (bars.length < 10) return { vpinSeries: [], isToxic: false, stats: {} };

  const volumes = bars.map(b => b.volume);
  const vBucket = median(volumes) / 50;

  // Compute returns and classify buy/sell per bar
  const sigma = std(bars.slice(1).map((b, i) => b.close / bars[i].close - 1));
  const classified = bars.map((b, i) => {
    if (i === 0) return { ...b, vBuy: b.volume / 2, vSell: b.volume / 2 };
    const ret = b.close / bars[i - 1].close - 1;
    const z = sigma > 0 ? ret / sigma : 0;
    const vBuy = b.volume * phi(z);
    return { ...b, vBuy, vSell: b.volume - vBuy };
  });

  // Fill volume buckets
  const buckets = [];
  let bucketBuy = 0;
  let bucketSell = 0;
  let bucketFill = 0;
  let bucketDate = classified[0].date;

  for (const bar of classified) {
    let remaining_v = bar.volume;
    let remaining_buy = bar.vBuy;
    let remaining_sell = bar.vSell;

    while (remaining_v > 0) {
      const need = vBucket - bucketFill;
      const take = Math.min(need, remaining_v);
      const fraction = take / bar.volume;

      bucketBuy += remaining_buy * fraction;
      bucketSell += remaining_sell * fraction;
      bucketFill += take;
      remaining_v -= take;
      remaining_buy -= remaining_buy * fraction;
      remaining_sell -= remaining_sell * fraction;

      if (bucketFill >= vBucket * 0.99) {
        buckets.push({
          date: bar.date,
          imbalance: Math.abs(bucketBuy - bucketSell) / vBucket,
        });
        bucketBuy = 0;
        bucketSell = 0;
        bucketFill = 0;
        bucketDate = bar.date;
      }
    }
  }

  if (buckets.length < nBuckets) nBuckets = Math.max(5, Math.floor(buckets.length / 2));

  // Rolling VPIN over last nBuckets
  const vpinSeries = [];
  for (let i = nBuckets - 1; i < buckets.length; i++) {
    const window = buckets.slice(i - nBuckets + 1, i + 1);
    const vpin = window.reduce((a, b) => a + b.imbalance, 0) / nBuckets;
    vpinSeries.push({ date: buckets[i].date, vpin });
  }

  const vpinVals = vpinSeries.map(x => x.vpin);
  const mu = mean(vpinVals);
  const sigma2 = std(vpinVals);
  const toxicThreshold = mu + sigmaMult * sigma2;

  const current = vpinVals[vpinVals.length - 1] ?? 0;
  const isToxic = current > toxicThreshold;

  return {
    vpinSeries,
    toxicThreshold,
    isToxic,
    stats: { current, mu, sigma: sigma2, toxicThreshold },
  };
}
