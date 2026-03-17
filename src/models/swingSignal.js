/**
 * Swing Trade Signal Engine — 2-day to 2-week horizon
 *
 * Combines:
 *   - EMA 20/50 trend filter (daily bars)       → trend direction
 *   - ATR(14) for stop-loss & target placement  → risk sizing
 *   - OFI (1h bars) for entry timing            → entry trigger
 *   - VPIN (1h bars) toxicity gate              → flow filter
 *   - HMM regime overlay                        → size multiplier
 *   - Fractional Kelly                          → position %
 *
 * Outputs a single, actionable SwingTrade object.
 */

// ── EMA ─────────────────────────────────────────────────────────────────────
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

// ── ATR(14) ──────────────────────────────────────────────────────────────────
function atr(bars, period = 14) {
  const trs = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const prevClose = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
  });
  // Wilder smoothing
  let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = Array(period - 1).fill(null);
  result.push(atrVal);
  for (let i = period; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
    result.push(atrVal);
  }
  return result;
}

// ── RSI(14) ──────────────────────────────────────────────────────────────────
function rsi(prices, period = 14) {
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
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

// ── Volume Surge ──────────────────────────────────────────────────────────────
function volumeSurge(bars, period = 20) {
  return bars.map((b, i) => {
    if (i < period) return 1;
    const avg = bars.slice(i - period, i).reduce((a, c) => a + c.volume, 0) / period;
    return avg > 0 ? b.volume / avg : 1;
  });
}

// ── Trend Quality (ADX-proxy) ─────────────────────────────────────────────────
function trendStrength(closes, period = 14) {
  // Directional movement proxy: abs(EMA20 slope) normalized
  const e20 = ema(closes, 20);
  const valid = e20.filter(v => v != null);
  if (valid.length < 5) return 0;
  const recent = valid.slice(-5);
  const slope = (recent[4] - recent[0]) / recent[0];
  return Math.min(1, Math.abs(slope) * 50); // 0→1
}

/**
 * Main swing trade signal computation.
 *
 * @param {Object} params
 * @param {Array}  params.dailyBars   - [{date,open,high,low,close,volume}] 6mo daily
 * @param {Array}  params.hourlyBars  - [{date,open,high,low,close,volume}] 60d hourly
 * @param {Object} params.ofi         - ofiSignal() result (computed on hourly)
 * @param {Object} params.vpin        - computeVPIN() result (computed on hourly)
 * @param {Object} params.alpha       - computeAlpha() result
 * @param {Object} params.kelly       - computeKelly() result (computed on daily)
 * @param {Object} params.regime      - computeRegimes() result (computed on daily)
 * @returns {SwingTrade}
 */
export function computeSwingSignal({ dailyBars, hourlyBars, ofi, vpin, alpha, kelly, regime }) {
  if (!dailyBars || dailyBars.length < 30) return null;

  const closes = dailyBars.map(b => b.close);
  const currentPrice = closes[closes.length - 1];
  const currentDate  = dailyBars[dailyBars.length - 1].date;

  // ── Indicators ──────────────────────────────────────────────────────────────
  const ema20arr = ema(closes, 20);
  const ema50arr = ema(closes, 50);
  const atr14arr = atr(dailyBars, 14);
  const rsi14arr = rsi(closes, 14);
  const volSurge = volumeSurge(dailyBars, 20);

  const ema20  = ema20arr[ema20arr.length - 1];
  const ema50  = ema50arr[ema50arr.length - 1];
  const atr14  = atr14arr[atr14arr.length - 1];
  const rsi14  = rsi14arr[rsi14arr.length - 1];
  const vSurge = volSurge[volSurge.length - 1];

  // EMA slope direction (last 3 bars)
  const ema20slope = ema20arr.slice(-4).filter(Boolean);
  const ema20Dir   = ema20slope.length >= 2
    ? ema20slope[ema20slope.length - 1] > ema20slope[0] ? 1 : -1
    : 0;

  // ── Trend Filter ────────────────────────────────────────────────────────────
  const bullTrend = ema20 > ema50 && ema20Dir > 0 && currentPrice > ema20;
  const bearTrend = ema20 < ema50 && ema20Dir < 0 && currentPrice < ema20;
  const inTrend   = bullTrend || bearTrend;

  // ── Gate Checks ─────────────────────────────────────────────────────────────
  const vpinToxic   = vpin?.isToxic ?? false;
  const alphaStrong = Math.abs(alpha?.alpha ?? 0) > alpha?.threshold;
  const ofiDir      = ofi?.current ?? 0;
  const regimeState = regime?.currentRegime ?? 'VOLATILE';
  const kellySize   = kelly?.fAdj ?? 0;

  // RSI gates: avoid overbought/oversold extremes for swing entries
  const rsiOk = rsi14 != null
    ? (alpha?.alpha > 0 ? rsi14 < 75 : rsi14 > 25)   // long: not overbought, short: not oversold
    : true;

  // Volume confirmation
  const volOk = vSurge >= 0.8;  // at least 80% of avg volume

  // ── Signal Scoring (0–100) ───────────────────────────────────────────────────
  let score = 0;
  const reasons = [];
  const warnings = [];

  // EMA trend (+25)
  if (bullTrend && (alpha?.alpha ?? 0) > 0) { score += 25; reasons.push('EMA 20>50 bullish trend'); }
  else if (bearTrend && (alpha?.alpha ?? 0) < 0) { score += 25; reasons.push('EMA 20<50 bearish trend'); }
  else { warnings.push('Price vs EMA trend misaligned'); }

  // Alpha signal (+25)
  if (alphaStrong) { score += 25; reasons.push(`Alpha signal ${(alpha?.alpha ?? 0) > 0 ? 'bullish' : 'bearish'} (|α|>${alpha?.threshold})`); }
  else { warnings.push('Alpha below threshold θ'); }

  // OFI confirmation (+20)
  if (Math.abs(ofiDir) > 0.1 && Math.sign(ofiDir) === Math.sign(alpha?.alpha ?? 0)) {
    score += 20; reasons.push('OFI confirms direction');
  } else { warnings.push('OFI not confirming signal direction'); }

  // VPIN clean (+15)
  if (!vpinToxic) { score += 15; reasons.push('VPIN below toxic threshold'); }
  else { warnings.push('⚠ TOXIC flow — position sizing reduced 50%'); }

  // RSI (+10)
  if (rsiOk) { score += 10; reasons.push(`RSI ${rsi14?.toFixed(1)} in swing range`); }
  else { warnings.push(`RSI ${rsi14?.toFixed(1)} at extreme — pullback risk`); }

  // Volume surge (+5)
  if (vSurge >= 1.2) { score += 5; reasons.push(`Volume surge ${vSurge.toFixed(2)}×`); }

  // Regime overlay: volatile regime docks 20 points
  if (regimeState === 'VOLATILE') {
    score = Math.max(0, score - 20);
    warnings.push('Volatile regime — reduced conviction');
  }

  // ── Direction ───────────────────────────────────────────────────────────────
  const rawDir = bullTrend ? 'LONG' : bearTrend ? 'SHORT' : (alpha?.alpha ?? 0) > 0 ? 'LONG' : 'SHORT';
  const direction = vpinToxic ? 'FLAT' : score < 35 ? 'FLAT' : rawDir;

  // ── ATR-based levels ─────────────────────────────────────────────────────────
  const atrMult = {
    stop:    1.5,   // 1.5 × ATR stop
    target1: 2.0,   // 1:1.33 R:R minimum
    target2: 3.5,   // 1:2.33 R:R extended
  };

  const stopLoss   = direction === 'LONG'  ? currentPrice - atrMult.stop    * atr14
                   : direction === 'SHORT' ? currentPrice + atrMult.stop    * atr14
                   : null;
  const target1    = direction === 'LONG'  ? currentPrice + atrMult.target1 * atr14
                   : direction === 'SHORT' ? currentPrice - atrMult.target1 * atr14
                   : null;
  const target2    = direction === 'LONG'  ? currentPrice + atrMult.target2 * atr14
                   : direction === 'SHORT' ? currentPrice - atrMult.target2 * atr14
                   : null;

  const riskPct    = stopLoss ? Math.abs(currentPrice - stopLoss) / currentPrice : 0;
  const reward1Pct = target1  ? Math.abs(target1 - currentPrice)  / currentPrice : 0;
  const reward2Pct = target2  ? Math.abs(target2 - currentPrice)  / currentPrice : 0;
  const rrRatio1   = riskPct > 0 ? reward1Pct / riskPct : 0;
  const rrRatio2   = riskPct > 0 ? reward2Pct / riskPct : 0;

  // ── Holding Period Estimate ──────────────────────────────────────────────────
  // Base on regime + signal strength
  let holdDaysMin = 2, holdDaysMax = 5;
  if (regimeState === 'TRENDING')       { holdDaysMin = 5;  holdDaysMax = 14; }
  if (regimeState === 'MEAN_REVERTING') { holdDaysMin = 2;  holdDaysMax = 5;  }
  if (regimeState === 'VOLATILE')       { holdDaysMin = 1;  holdDaysMax = 3;  }

  // ── Position Size ────────────────────────────────────────────────────────────
  // Kelly-adjusted, halved if toxic, halved if volatile
  let positionPct = kellySize * 100;
  if (vpinToxic)              positionPct *= 0.5;
  if (regimeState === 'VOLATILE') positionPct *= 0.5;
  positionPct = Math.max(0, Math.min(positionPct, 25)); // hard cap 25%

  // ── Exit Rule ────────────────────────────────────────────────────────────────
  const exitRules = [];
  if (stopLoss)  exitRules.push(`Stop loss: $${stopLoss.toFixed(2)} (${(riskPct * 100).toFixed(1)}% risk, 1.5×ATR)`);
  if (target1)   exitRules.push(`Target 1:  $${target1.toFixed(2)} (${(reward1Pct * 100).toFixed(1)}% gain, R:R ${rrRatio1.toFixed(2)})`);
  if (target2)   exitRules.push(`Target 2:  $${target2.toFixed(2)} (${(reward2Pct * 100).toFixed(1)}% gain, R:R ${rrRatio2.toFixed(2)})`);
  exitRules.push(`Time exit: close if no momentum after ${holdDaysMax} trading days`);
  exitRules.push(`Alpha exit: close if α reverts past 0 after entry`);

  // ── Conviction Grade ─────────────────────────────────────────────────────────
  const grade = score >= 80 ? 'A'
              : score >= 65 ? 'B'
              : score >= 50 ? 'C'
              : score >= 35 ? 'D'
              : 'F';

  const gradeLabel = { A: 'HIGH CONVICTION', B: 'MODERATE', C: 'LOW CONVICTION', D: 'SPECULATIVE', F: 'NO TRADE' };

  return {
    // Core decision
    direction,
    score,
    grade,
    gradeLabel: gradeLabel[grade],
    shouldTrade: direction !== 'FLAT' && grade !== 'F',

    // Levels
    currentPrice,
    stopLoss,
    target1,
    target2,
    riskPct,
    reward1Pct,
    reward2Pct,
    rrRatio1,
    rrRatio2,
    atr14,

    // Sizing & timing
    positionPct,
    holdDaysMin,
    holdDaysMax,
    currentDate,

    // Indicators for display
    indicators: {
      ema20, ema50, rsi14, atr14, vSurge,
      ema20arr: ema20arr.slice(-90),
      ema50arr: ema50arr.slice(-90),
      atr14arr: atr14arr.slice(-90),
      rsi14arr: rsi14arr.slice(-90),
      bullTrend, bearTrend, inTrend, ema20Dir,
    },

    // Explanation
    reasons,
    warnings,
    exitRules,
  };
}
