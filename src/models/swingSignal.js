/**
 * Swing Trade Signal Engine — 2-day to 2-week horizon
 *
 * Fibonacci parameters:
 *   EMA fast      = 21   (was 20)
 *   EMA slow      = 55   (was 50)
 *   ATR period    = 13   (was 14)
 *   RSI period    = 13   (was 14)
 *   Volume avg    = 21   (was 20)
 *   Trend window  = 13   (was 14)
 *   EMA slope     = 3    (Fib ✓)
 */

const EMA_FAST   = 21;   // Fib
const EMA_SLOW   = 55;   // Fib
const ATR_PERIOD = 13;   // Fib
const RSI_PERIOD = 13;   // Fib
const VOL_PERIOD = 21;   // Fib
const SLOPE_BARS = 3;    // Fib ✓

// ── EMA ──────────────────────────────────────────────────────────────────────
function ema(prices, period) {
  const k = 2 / (period + 1);
  const result = [];
  let prev = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(...Array(period - 1).fill(null));
  result.push(prev);
  for (let i = period; i < prices.length; i++) {
    prev = prices[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

// ── ATR(13) ───────────────────────────────────────────────────────────────────
function atr(bars, period = ATR_PERIOD) {
  const trs = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = Array(period - 1).fill(null);
  result.push(atrVal);
  for (let i = period; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
    result.push(atrVal);
  }
  return result;
}

// ── RSI(13) ───────────────────────────────────────────────────────────────────
function rsi(prices, period = RSI_PERIOD) {
  const result = Array(period).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0))  / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

// ── Volume Surge (21-bar avg) ──────────────────────────────────────────────────
function volumeSurge(bars, period = VOL_PERIOD) {
  return bars.map((b, i) => {
    if (i < period) return 1;
    const avg = bars.slice(i - period, i).reduce((a, c) => a + c.volume, 0) / period;
    return avg > 0 ? b.volume / avg : 1;
  });
}

/**
 * Main swing trade signal computation.
 */
export function computeSwingSignal({ dailyBars, hourlyBars, ofi, vpin, alpha, kelly, regime }) {
  if (!dailyBars || dailyBars.length < 34) return null;

  const closes       = dailyBars.map(b => b.close);
  const currentPrice = closes[closes.length - 1];
  const currentDate  = dailyBars[dailyBars.length - 1].date;

  // ── Indicators ─────────────────────────────────────────────────────────────
  const ema21arr = ema(closes, EMA_FAST);    // 21-period (Fib)
  const ema55arr = ema(closes, EMA_SLOW);    // 55-period (Fib)
  const atr13arr = atr(dailyBars, ATR_PERIOD);
  const rsi13arr = rsi(closes, RSI_PERIOD);
  const volSurge = volumeSurge(dailyBars, VOL_PERIOD);

  const ema21  = ema21arr[ema21arr.length - 1];
  const ema55  = ema55arr[ema55arr.length - 1];
  const atr13  = atr13arr[atr13arr.length - 1];
  const rsi13  = rsi13arr[rsi13arr.length - 1];
  const vSurge = volSurge[volSurge.length - 1];

  // EMA slope over last 3 bars (Fib)
  const ema21slope = ema21arr.slice(-(SLOPE_BARS + 1)).filter(Boolean);
  const ema21Dir   = ema21slope.length >= 2
    ? ema21slope[ema21slope.length - 1] > ema21slope[0] ? 1 : -1
    : 0;

  // ── Trend Filter ───────────────────────────────────────────────────────────
  const bullTrend = ema21 > ema55 && ema21Dir > 0 && currentPrice > ema21;
  const bearTrend = ema21 < ema55 && ema21Dir < 0 && currentPrice < ema21;

  // ── Gates ──────────────────────────────────────────────────────────────────
  const vpinToxic   = vpin?.isToxic ?? false;
  const alphaStrong = Math.abs(alpha?.alpha ?? 0) > (alpha?.threshold ?? 0.15);
  const ofiDir      = ofi?.current ?? 0;
  const regimeState = regime?.currentRegime ?? 'VOLATILE';
  const kellySize   = kelly?.fAdj ?? 0;

  // RSI gate: long not overbought (>75), short not oversold (<25)
  const rsiOk = rsi13 != null
    ? ((alpha?.alpha ?? 0) > 0 ? rsi13 < 75 : rsi13 > 25)
    : true;

  // ── Conviction Score ────────────────────────────────────────────────────────
  let score = 0;
  const reasons  = [];
  const warnings = [];

  if (bullTrend && (alpha?.alpha ?? 0) > 0) {
    score += 25; reasons.push(`EMA${EMA_FAST} > EMA${EMA_SLOW} — bullish trend confirmed`);
  } else if (bearTrend && (alpha?.alpha ?? 0) < 0) {
    score += 25; reasons.push(`EMA${EMA_FAST} < EMA${EMA_SLOW} — bearish trend confirmed`);
  } else {
    warnings.push(`EMA${EMA_FAST}/${EMA_SLOW} trend misaligned with alpha direction`);
  }

  if (alphaStrong) {
    score += 25; reasons.push(`Alpha signal ${(alpha?.alpha ?? 0) > 0 ? 'bullish' : 'bearish'} (|α| > θ)`);
  } else {
    warnings.push('Alpha below threshold θ — insufficient edge');
  }

  if (Math.abs(ofiDir) > 0.1 && Math.sign(ofiDir) === Math.sign(alpha?.alpha ?? 0)) {
    score += 20; reasons.push('1h OFI confirms signal direction');
  } else {
    warnings.push('OFI not confirming direction on 1h bars');
  }

  if (!vpinToxic) {
    score += 15; reasons.push('VPIN below μ+1.5σ — clean flow');
  } else {
    warnings.push('⚠ TOXIC FLOW — VPIN exceeds threshold');
  }

  if (rsiOk) {
    score += 10; reasons.push(`RSI(${RSI_PERIOD}) = ${rsi13?.toFixed(1)} in tradeable range`);
  } else {
    warnings.push(`RSI(${RSI_PERIOD}) = ${rsi13?.toFixed(1)} at extreme — entry risk`);
  }

  if (vSurge >= 1.2) {
    score += 5; reasons.push(`Volume surge ${vSurge.toFixed(2)}× (${VOL_PERIOD}-bar avg)`);
  }

  if (regimeState === 'VOLATILE') {
    score = Math.max(0, score - 20);
    warnings.push('Volatile HMM regime — conviction docked 20pts');
  }

  // ── Direction & Position ────────────────────────────────────────────────────
  const rawDir  = bullTrend ? 'LONG' : bearTrend ? 'SHORT' : (alpha?.alpha ?? 0) > 0 ? 'LONG' : 'SHORT';
  const direction = vpinToxic || score < 35 ? 'FLAT' : rawDir;

  // ── ATR(13) Levels ──────────────────────────────────────────────────────────
  const stopLoss = direction === 'LONG'  ? currentPrice - 1.5 * atr13
                 : direction === 'SHORT' ? currentPrice + 1.5 * atr13
                 : null;
  const target1  = direction === 'LONG'  ? currentPrice + 2   * atr13
                 : direction === 'SHORT' ? currentPrice - 2   * atr13
                 : null;
  const target2  = direction === 'LONG'  ? currentPrice + 3.5 * atr13
                 : direction === 'SHORT' ? currentPrice - 3.5 * atr13
                 : null;

  const riskPct    = stopLoss ? Math.abs(currentPrice - stopLoss) / currentPrice : 0;
  const reward1Pct = target1  ? Math.abs(target1 - currentPrice)  / currentPrice : 0;
  const reward2Pct = target2  ? Math.abs(target2 - currentPrice)  / currentPrice : 0;
  const rrRatio1   = riskPct  > 0 ? reward1Pct / riskPct : 0;
  const rrRatio2   = riskPct  > 0 ? reward2Pct / riskPct : 0;

  // ── Holding Period by Regime ────────────────────────────────────────────────
  const holdRange = {
    TRENDING:       [5,  14],
    MEAN_REVERTING: [2,  5],
    VOLATILE:       [1,  3],
  }[regimeState] ?? [2, 5];
  const [holdDaysMin, holdDaysMax] = holdRange;

  // ── Kelly-Adjusted Position Size ───────────────────────────────────────────
  let positionPct = kellySize * 100;
  if (vpinToxic)              positionPct *= 0.5;
  if (regimeState === 'VOLATILE') positionPct *= 0.5;
  positionPct = Math.max(0, Math.min(positionPct, 25));

  // ── Exit Rules ─────────────────────────────────────────────────────────────
  const exitRules = [];
  if (stopLoss) exitRules.push(`Stop loss: $${stopLoss.toFixed(2)} (1.5 × ATR${ATR_PERIOD} = ${(riskPct * 100).toFixed(1)}%)`);
  if (target1)  exitRules.push(`Target 1:  $${target1.toFixed(2)}  (2.0 × ATR${ATR_PERIOD}, R:R ${rrRatio1.toFixed(2)})`);
  if (target2)  exitRules.push(`Target 2:  $${target2.toFixed(2)}  (3.5 × ATR${ATR_PERIOD}, R:R ${rrRatio2.toFixed(2)})`);
  exitRules.push(`Time exit: close position after ${holdDaysMax} trading days if no momentum`);
  exitRules.push(`Alpha exit: close if combined α reverts past zero after entry`);
  exitRules.push(`VPIN exit:  reduce 50% if VPIN crosses μ+1.5σ while in trade`);

  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
  const gradeLabel = { A: 'HIGH CONVICTION', B: 'MODERATE', C: 'LOW CONVICTION', D: 'SPECULATIVE', F: 'NO TRADE' };

  return {
    direction, score, grade, gradeLabel: gradeLabel[grade],
    shouldTrade: direction !== 'FLAT' && grade !== 'F',
    currentPrice, stopLoss, target1, target2,
    riskPct, reward1Pct, reward2Pct, rrRatio1, rrRatio2,
    atr13, positionPct, holdDaysMin, holdDaysMax, currentDate,
    indicators: {
      ema21, ema55, rsi13, atr13, vSurge,
      ema20arr: ema21arr.slice(-90),   // keep prop names for PriceChart compat
      ema50arr: ema55arr.slice(-90),
      atr14arr: atr13arr.slice(-90),
      rsi14arr: rsi13arr.slice(-90),
      bullTrend, bearTrend, inTrend: bullTrend || bearTrend, ema20Dir: ema21Dir,
      // Fib labels for display
      emaFastPeriod: EMA_FAST,
      emaSlowPeriod: EMA_SLOW,
      rsiPeriod: RSI_PERIOD,
      atrPeriod: ATR_PERIOD,
    },
    reasons, warnings, exitRules,
  };
}
