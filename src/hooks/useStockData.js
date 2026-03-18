import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchOHLCV, fetchQuote, hasApiKey } from '../api/twelveData';
import { computeOFI, ofiSignal } from '../models/ofi';
import { computeVPIN } from '../models/vpin';
import { computeKelly } from '../models/kelly';
import { computeRegimes } from '../models/hmm';
import { computeAlpha } from '../models/alpha';
import { computeSwingSignal } from '../models/swingSignal';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useStockData() {
  const [status, setStatus]       = useState('idle');
  const [error, setError]         = useState(null);
  const [results, setResults]     = useState(null);
  const [loadingStep, setLoadingStep] = useState('');
  const [countdown, setCountdown] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const symbolRef      = useRef(null);
  const autoRefRef     = useRef(true);
  const refreshTimer   = useRef(null);
  const countdownTimer = useRef(null);

  useEffect(() => { autoRefRef.current = autoRefresh; }, [autoRefresh]);

  // ── Countdown scheduler — defined FIRST so analyze can reference it ────────
  const scheduleNextRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    clearInterval(countdownTimer.current);

    let secondsLeft = REFRESH_INTERVAL_MS / 1000;
    setCountdown(secondsLeft);

    // Tick every second
    countdownTimer.current = setInterval(() => {
      secondsLeft -= 1;
      setCountdown(s => s - 1);
      if (secondsLeft <= 0) clearInterval(countdownTimer.current);
    }, 1000);

    // Fire the refresh after the full interval
    refreshTimer.current = setTimeout(() => {
      if (autoRefRef.current && symbolRef.current) {
        analyzeRef.current(symbolRef.current, true);
      }
    }, REFRESH_INTERVAL_MS);
  }, []);

  // ── Core analysis function ─────────────────────────────────────────────────
  const analyze = useCallback(async (symbol, silent = false) => {
    const sym = symbol || symbolRef.current;
    if (!sym) return;
    symbolRef.current = sym;

    if (!silent) {
      setStatus('loading');
      setError(null);
      setResults(null);
    } else {
      setLoadingStep('Refreshing…');
    }

    try {
      setLoadingStep('Fetching daily bars (6mo)…');
      const { meta, bars: dailyBars } = await fetchOHLCV(sym, 150, '1day');

      setLoadingStep('Fetching hourly bars (60d)…');
      let hourlyBars = [];
      try {
        const { bars } = await fetchOHLCV(sym, 500, '1h');
        hourlyBars = bars;
      } catch {
        hourlyBars = dailyBars;
      }

      const ofiSource = hourlyBars.length >= 20 ? hourlyBars : dailyBars;

      setLoadingStep('Running OFI on hourly data…');
      const ofiBars = computeOFI(ofiSource);
      const ofi = ofiSignal(ofiBars);

      setLoadingStep('Computing VPIN toxicity…');
      const vpinResult = computeVPIN(ofiSource, 50, 1.5);

      setLoadingStep('Calibrating Kelly sizing (daily)…');
      const kellyResult = computeKelly(dailyBars);

      setLoadingStep('HMM regime detection (daily)…');
      const regimeResult = computeRegimes(dailyBars);

      setLoadingStep('Computing combined alpha signal…');
      const alphaResult = computeAlpha(ofi, vpinResult, kellyResult);

      setLoadingStep('Computing swing trade signal…');
      const swingResult = computeSwingSignal({
        dailyBars, hourlyBars: ofiSource,
        ofi, vpin: vpinResult, alpha: alphaResult,
        kelly: kellyResult, regime: regimeResult,
      });

      setLoadingStep('Fetching live quote…');
      let quote = null;
      try {
        quote = await fetchQuote(sym);
      } catch {
        quote = {
          symbol: meta.symbol,
          price: dailyBars[dailyBars.length - 1].close,
          previousClose: dailyBars[dailyBars.length - 2]?.close,
        };
      }

      setResults({
        symbol: meta.symbol || sym.toUpperCase(),
        quote, bars: dailyBars, hourlyBars: ofiSource,
        ofiBars, ofi, vpin: vpinResult, kelly: kellyResult,
        regime: regimeResult, alpha: alphaResult, swing: swingResult,
        computedAt: new Date().toISOString(),
        usingHourly: hourlyBars.length >= 20,
      });

      setStatus('success');
      scheduleNextRefresh(); // restart the 5-min clock after every successful fetch

    } catch (err) {
      console.error('Analysis failed:', err);
      setError(err.message || 'Failed to fetch data');
      if (!silent) setStatus('error');
      else setStatus('success'); // keep old results on silent failure
    } finally {
      setLoadingStep('');
    }
  }, [scheduleNextRefresh]);

  // Keep a stable ref to analyze so the setTimeout inside scheduleNextRefresh
  // always calls the latest version without creating a circular dependency
  const analyzeRef = useRef(analyze);
  useEffect(() => { analyzeRef.current = analyze; }, [analyze]);

  // Resume refresh when tab becomes visible (browsers throttle hidden timers)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' &&
          autoRefRef.current && symbolRef.current) {
        analyzeRef.current(symbolRef.current, true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(refreshTimer.current);
      clearInterval(countdownTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => {
      if (prev) {
        clearTimeout(refreshTimer.current);
        clearInterval(countdownTimer.current);
        setCountdown(null);
      } else {
        if (symbolRef.current) scheduleNextRefresh();
      }
      return !prev;
    });
  }, [scheduleNextRefresh]);

  const refreshNow = useCallback(() => {
    if (symbolRef.current) analyze(symbolRef.current, true);
  }, [analyze]);

  return {
    status, error, results, loadingStep,
    analyze, countdown, autoRefresh,
    toggleAutoRefresh, refreshNow,
  };
}
