import { useState } from 'react';
import { useStockData } from './hooks/useStockData';
import { PriceChart } from './components/PriceChart';
import { SignalPanel } from './components/SignalPanel';
import { KellyPanel, RegimePanel } from './components/KellyRegimePanel';
import { TradeCard } from './components/TradeCard';

const PRESETS = ['AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'MSFT', 'AMZN', 'META'];

function Header({ symbol, quote, usingHourly, countdown, autoRefresh, onToggle, onRefreshNow, loadingStep }) {
  const change = quote?.price && quote?.previousClose
    ? quote.price - quote.previousClose : 0;
  const changePct = quote?.previousClose ? (change / quote.previousClose) * 100 : 0;
  const isUp = change >= 0;

  // Format countdown mm:ss
  const mins = countdown != null ? Math.floor(countdown / 60) : null;
  const secs = countdown != null ? String(countdown % 60).padStart(2, '0') : null;
  const countdownPct = countdown != null ? (countdown / 600) * 100 : 0;

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 24px', borderBottom: '1px solid var(--border)',
      background: 'var(--bg-panel)', position: 'sticky', top: 0, zIndex: 100,
      gap: 16, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 800, letterSpacing: '0.15em', color: 'var(--cyan)' }}>
          MICROSTRUCTURE EDGE
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          SWING TRADE · 2D–2W HORIZON
        </div>
      </div>

      {symbol && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {usingHourly && <span className="badge badge-cyan" style={{ fontSize: 9 }}>1H + 1D DUAL TF</span>}
          <div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800 }}>{symbol}</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>{quote?.exchangeName}</span>
          </div>
          {quote?.price && (
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>${quote.price.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: isUp ? 'var(--green)' : 'var(--red)' }}>
                {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({Math.abs(changePct).toFixed(2)}%)
              </div>
            </div>
          )}
          <span className={`badge ${quote?.marketState === 'REGULAR' ? 'badge-green' : 'badge-dim'}`}>
            {quote?.marketState ?? '—'}
          </span>
        </div>
      )}

      {/* Auto-refresh controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
        {loadingStep && (
          <span style={{ fontSize: 10, color: 'var(--cyan)', animation: 'pulse 1s infinite' }}>
            ⚡ {loadingStep}
          </span>
        )}

        {/* Countdown ring */}
        {countdown != null && autoRefresh && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ position: 'relative', width: 32, height: 32 }}>
              <svg viewBox="0 0 32 32" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
                <circle cx="16" cy="16" r="12" fill="none" stroke="var(--cyan)" strokeWidth="3"
                  strokeDasharray={`${(countdownPct / 100) * 75.4} 75.4`}
                  strokeLinecap="round"
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: 'var(--cyan)', fontWeight: 700 }}>
                {mins}:{secs}
              </div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>next refresh</span>
          </div>
        )}

        {/* Refresh now */}
        {symbol && (
          <button onClick={onRefreshNow}
            title="Refresh now"
            style={{
              padding: '5px 10px', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 4,
              color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
              lineHeight: 1,
            }}
            onMouseEnter={e => { e.target.style.borderColor = 'var(--cyan)'; e.target.style.color = 'var(--cyan)'; }}
            onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-secondary)'; }}
          >↺</button>
        )}

        {/* Pause / Resume */}
        {symbol && (
          <button onClick={onToggle}
            style={{
              padding: '5px 12px',
              background: autoRefresh ? 'rgba(0,180,216,0.1)' : 'rgba(255,193,7,0.1)',
              border: `1px solid ${autoRefresh ? 'var(--cyan)' : 'var(--amber)'}`,
              borderRadius: 4,
              color: autoRefresh ? 'var(--cyan)' : 'var(--amber)',
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', cursor: 'pointer',
            }}
          >
            {autoRefresh ? '⏸ PAUSE' : '▶ RESUME'}
          </button>
        )}

        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{new Date().toLocaleTimeString()}</div>
      </div>
    </header>
  );
}

function LoadingScreen({ step }) {
  const steps = [
    'Fetching daily bars (6mo)…',
    'Fetching hourly bars (60d)…',
    'Running OFI on hourly data…',
    'Computing VPIN toxicity…',
    'Calibrating Kelly sizing…',
    'HMM regime detection…',
    'Computing swing trade signal…',
  ];
  const activeIdx = steps.findIndex(s => s === step);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 24 }}>
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        <svg viewBox="0 0 80 80" style={{ animation: 'spin 2s linear infinite' }}>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(0,180,216,0.15)" strokeWidth="3" />
          <circle cx="40" cy="40" r="32" fill="none" stroke="var(--cyan)" strokeWidth="3"
            strokeDasharray="40 160" strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 6px var(--cyan))' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--cyan)', marginBottom: 16 }}>
          COMPUTING SWING SIGNALS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
          {steps.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <span style={{
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                background: i < activeIdx ? 'var(--green)' : i === activeIdx ? 'var(--cyan)' : 'rgba(255,255,255,0.08)',
                boxShadow: i === activeIdx ? '0 0 8px var(--cyan)' : 'none',
                animation: i === activeIdx ? 'pulse 1s infinite' : 'none',
              }} />
              <span style={{ color: i <= activeIdx ? 'var(--text-primary)' : 'var(--text-dim)' }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState('');
  const { status, error, results, loadingStep, analyze, countdown, autoRefresh, toggleAutoRefresh, refreshNow } = useStockData();

  const handleSubmit = (sym) => {
    const s = (sym || input).trim().toUpperCase();
    if (!s) return;
    setInput(s);
    analyze(s);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Header
        symbol={results?.symbol}
        quote={results?.quote}
        usingHourly={results?.usingHourly}
        countdown={countdown}
        autoRefresh={autoRefresh}
        onToggle={toggleAutoRefresh}
        onRefreshNow={refreshNow}
        loadingStep={status === 'success' ? loadingStep : ''}
      />

      <main style={{ maxWidth: 1440, margin: '0 auto', padding: '20px' }}>

        {/* Search Bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="SYMBOL  e.g. AAPL"
            style={{
              width: 220, padding: '9px 14px',
              background: 'var(--bg-card)', border: '1px solid var(--border-bright)',
              borderRadius: 4, color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600,
              letterSpacing: '0.08em', outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--cyan)'; e.target.style.boxShadow = '0 0 0 2px rgba(0,180,216,0.15)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--border-bright)'; e.target.style.boxShadow = 'none'; }}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={status === 'loading' || !input.trim()}
            style={{
              padding: '9px 22px',
              background: status === 'loading' ? 'rgba(0,180,216,0.1)' : 'var(--cyan)',
              color: status === 'loading' ? 'var(--cyan)' : '#000',
              border: '1px solid var(--cyan)', borderRadius: 4,
              fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
              letterSpacing: '0.1em', cursor: status === 'loading' ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'loading' ? 'COMPUTING…' : 'ANALYZE'}
          </button>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {PRESETS.map(sym => (
              <button key={sym} onClick={() => handleSubmit(sym)} disabled={status === 'loading'}
                style={{
                  padding: '6px 11px',
                  background: results?.symbol === sym ? 'rgba(0,180,216,0.15)' : 'transparent',
                  border: '1px solid var(--border)', borderRadius: 3,
                  color: results?.symbol === sym ? 'var(--cyan)' : 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', letterSpacing: '0.06em',
                }}
                onMouseEnter={e => { e.target.style.borderColor = 'var(--cyan)'; e.target.style.color = 'var(--cyan)'; }}
                onMouseLeave={e => { if (results?.symbol !== sym) { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-secondary)'; }}}
              >{sym}</button>
            ))}
          </div>
        </div>

        {/* Error */}
        {status === 'error' && (
          <div style={{
            padding: '12px 18px', background: 'rgba(255,69,96,0.08)',
            border: '1px solid rgba(255,69,96,0.4)', borderRadius: 6,
            marginBottom: 16, color: 'var(--red)', fontSize: 13,
          }}>
            <strong>⚠ Error:</strong> {error}
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              This may be a CORS or rate limit issue. Wait a few seconds and retry. Yahoo Finance temporarily blocks burst requests.
            </div>
          </div>
        )}

        {/* Loading */}
        {status === 'loading' && <LoadingScreen step={loadingStep} />}

        {/* Results */}
        {status === 'success' && results && (
          <div className="animate-in">

            {/* TRADE CARD — full width at top */}
            <div style={{ marginBottom: 12 }}>
              <TradeCard swing={results.swing} quote={results.quote} />
            </div>

            {/* Main 3-column grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px 300px', gap: 10, alignItems: 'start' }}>

              {/* Charts column */}
              <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <PriceChart
                  bars={results.bars}
                  ofiBars={results.ofiBars}
                  vpinSeries={results.vpin?.vpinSeries}
                  swing={results.swing}
                />
              </div>

              {/* Signal column */}
              <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SignalPanel
                  ofi={results.ofi}
                  vpin={results.vpin}
                  alpha={results.alpha}
                  kelly={results.kelly}
                />
              </div>

              {/* Kelly + Regime column */}
              <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <RegimePanel regime={results.regime} />
                <KellyPanel kelly={results.kelly} />
                <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '8px 12px', borderTop: '1px solid var(--border)', lineHeight: 1.8 }}>
                  {results.usingHourly
                    ? 'OFI & VPIN computed on 1h bars · Kelly & HMM on 1d bars'
                    : 'All models on 1d bars (hourly unavailable for this symbol)'}
                  <br />Computed {new Date(results.computedAt).toLocaleTimeString()}
                  <br /><span style={{ color: 'rgba(255,255,255,0.15)' }}>Educational only · Not financial advice</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Idle */}
        {status === 'idle' && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.25 }}>📈</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
              Swing Trade Signal Engine
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto', lineHeight: 1.9 }}>
              Enter any US stock symbol for a 2-day to 2-week swing trade analysis.
              Dual timeframe: 1h bars for OFI & VPIN entry timing,
              daily bars for Kelly sizing & HMM regime detection.
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              {['🎯 Trade Direction', '⛔ Stop Loss (1.5×ATR)', '🚀 Targets (2×/3.5×ATR)',
                '📊 Position Size %', '📅 Hold 2–14 Days', 'A–F Conviction Grade',
                '§1 OFI (1h)', '§3 VPIN (1h)', '§6 Kelly', '§7 HMM Regime'].map(m => (
                <span key={m} className="badge badge-dim">{m}</span>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
