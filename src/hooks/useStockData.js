import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchOHLCV, fetchQuote } from '../api/yahooFinance';
import { computeOFI, ofiSignal } from '../models/ofi';
import { computeVPIN } from '../models/vpin';
import { computeKelly } from '../models/kelly';
import { computeRegimes } from '../models/hmm';
import { computeAlpha } from '../models/alpha';
import { computeSwingSignal } from '../models/swingSignal';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useStockData() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [loadingStep, setLoadingStep] = useState('');
  const [countdown, setCountdown] = useState(null);   // seconds until next refresh
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Refs so interval callbacks always see latest values without re-creating them
  const symbolRef     = useRef(null);
  const autoRefRef    = useRef(autoRefresh);
  const refreshTimer  = useRef(null);
  const countdownTimer= useRef(null);

  useEffect(() => { autoRefRef.current = autoRefresh; }, [autoRefresh]);

  // ── Core analysis function ──────────────────────────────────────────────────
  const analyze = useCallback(async (symbol, silent = false) => {
    const sym = symbol || symbolRef.current;
    if (!sym) return;
    symbolRef.current = sym;

    if (!silent) {
      setStatus('loading');
      setError(null);
      setResults(null);
    } else {
      // Silent refresh: keep existing results visible while re-computing
      setLoadingStep('Refreshing…');
    }

    try {
      setLoadingStep('Fetching daily bars (6mo)…');
      const { meta, bars: dailyBars } = await fetchOHLCV(sym, '6mo', '1d');

      setLoadingStep('Fetching hourly bars (60d)…');
      let hourlyBars = [];
      try {
        const { bars } = await fetchOHLCV(sym, '60d', '1h');
        hourlyBars = bars;
      } catch {
        hourlyBars = dailyBars;
      }

      const ofiSource  = hourlyBars.length >= 20 ? hourlyBars : dailyBars;
      const vpinSource = hourlyBars.length >= 20 ? hourlyBars : dailyBars;

      setLoadingStep('Running OFI on hourly data…');
      const ofiBars = computeOFI(ofiSource);
      const ofi = ofiSignal(ofiBars);

      setLoadingStep('Computing VPIN toxicity…');
      const vpinResult = computeVPIN(vpinSource, 50, 1.5);

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
      scheduleNextRefresh();              // reset countdown after each successful fetch
    } catch (err) {
      console.error('Analysis failed:', err);
      setError(err.message || 'Failed to fetch data');
      if (!silent) setStatus('error');
      else setStatus('success');          // keep previous results on silent-refresh failure
    } finally {
      setLoadingStep('');
    }
  }, []); // eslint-disable-line

  // ── Countdown + auto-refresh scheduler ────────────────────────────────────
  const scheduleNextRefresh = useCallback(() => {
    // Clear any existing timers
    clearInterval(refreshTimer.current);
    clearInterval(countdownTimer.current);

    let secondsLeft = REFRESH_INTERVAL_MS / 1000;
    setCountdown(secondsLeft);

    // Tick countdown every second
    countdownTimer.current = setInterval(() => {
      secondsLeft -= 1;
      setCountdown(secondsLeft);
      if (secondsLeft <= 0) clearInterval(countdownTimer.current);
    }, 1000);

    // Fire refresh after full interval
    refreshTimer.current = setTimeout(() => {
      if (autoRefRef.current && symbolRef.current) {
        analyze(symbolRef.current, true);  // silent = true → keep old results visible
      }
    }, REFRESH_INTERVAL_MS);
  }, [analyze]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(refreshTimer.current);
      clearInterval(countdownTimer.current);
    };
  }, []);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => {
      if (prev) {
        // Pausing — kill timers and clear countdown
        clearTimeout(refreshTimer.current);
        clearInterval(countdownTimer.current);
        setCountdown(null);
      } else {
        // Resuming — schedule immediately
        if (symbolRef.current) scheduleNextRefresh();
      }
      return !prev;
    });
  }, [scheduleNextRefresh]);

  const refreshNow = useCallback(() => {
    if (symbolRef.current) analyze(symbolRef.current, true);
  }, [analyze]);

  return { status, error, results, loadingStep, analyze, countdown, autoRefresh, toggleAutoRefresh, refreshNow };
}
