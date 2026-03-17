/**
 * TradeCard — The primary trade suggestion display
 * Shows direction, entry, stop, targets, position size, holding period
 */

function PriceLevel({ label, value, color, pct, isEntry }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      background: isEntry ? `${color}18` : 'rgba(255,255,255,0.03)',
      borderRadius: 4,
      border: `1px solid ${isEntry ? color + '50' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <div style={{ flex: '0 0 110px', fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
        ${value?.toFixed(2) ?? '—'}
      </div>
      {pct != null && (
        <div style={{ fontSize: 11, color, opacity: 0.8 }}>
          {pct >= 0 ? '+' : ''}{(pct * 100).toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score, grade, color }) {
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const fill = (score / 100) * circ;

  return (
    <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
      <svg viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle cx="48" cy="48" r={radius} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column'
      }}>
        <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{grade}</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{score}/100</div>
      </div>
    </div>
  );
}

function RRBar({ rrRatio, color }) {
  const pct = Math.min(100, (rrRatio / 4) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
        <span>R:R RATIO</span><span style={{ color: rrRatio >= 2 ? 'var(--green)' : rrRatio >= 1 ? 'var(--amber)' : 'var(--red)' }}>{rrRatio.toFixed(2)}</span>
      </div>
      <div className="progress-bar" style={{ height: 6 }}>
        <div className="progress-fill" style={{
          width: `${pct}%`,
          background: rrRatio >= 2 ? 'var(--green)' : rrRatio >= 1 ? 'var(--amber)' : 'var(--red)',
          boxShadow: rrRatio >= 2 ? '0 0 8px rgba(0,255,136,0.5)' : 'none',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: 'var(--text-dim)' }}>
        <span>1:0</span><span>1:2 MIN</span><span>1:4</span>
      </div>
    </div>
  );
}

export function TradeCard({ swing, quote }) {
  if (!swing) return null;

  const { direction, score, grade, gradeLabel, shouldTrade,
          currentPrice, stopLoss, target1, target2,
          riskPct, reward1Pct, reward2Pct, rrRatio1, rrRatio2,
          positionPct, holdDaysMin, holdDaysMax,
          reasons, warnings, exitRules, indicators, atr14 } = swing;

  const dirConfig = {
    LONG:  { color: 'var(--green)',  icon: '▲', bg: 'rgba(0,255,136,0.06)',  label: 'LONG — BUY' },
    SHORT: { color: 'var(--red)',    icon: '▼', bg: 'rgba(255,69,96,0.06)',  label: 'SHORT — SELL' },
    FLAT:  { color: 'var(--text-secondary)', icon: '—', bg: 'rgba(255,255,255,0.03)', label: 'FLAT — NO TRADE' },
  };
  const cfg = dirConfig[direction] ?? dirConfig.FLAT;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ── Main Trade Banner ── */}
      <div style={{
        background: cfg.bg,
        border: `1px solid ${cfg.color}50`,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: shouldTrade ? `0 0 40px ${cfg.color}15` : 'none',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
          borderBottom: `1px solid ${cfg.color}25`,
          background: `${cfg.color}08`,
        }}>
          <ScoreRing score={score} grade={grade} color={cfg.color} />

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 4 }}>SWING TRADE SIGNAL</div>
            <div style={{
              fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)',
              color: cfg.color, letterSpacing: '0.04em', lineHeight: 1,
            }}>
              {cfg.icon} {cfg.label}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className={`badge ${grade === 'A' ? 'badge-green' : grade === 'B' ? 'badge-cyan' : grade === 'C' ? 'badge-amber' : 'badge-red'}`}>
                {gradeLabel}
              </span>
              <span className="badge badge-dim">Hold {holdDaysMin}–{holdDaysMax} days</span>
              <span className="badge badge-dim">ATR {atr14?.toFixed(2)}</span>
            </div>
          </div>

          {/* Position size big number */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>POSITION SIZE</div>
            <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'var(--font-display)', color: cfg.color, lineHeight: 1 }}>
              {positionPct.toFixed(1)}<span style={{ fontSize: 16 }}>%</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>of portfolio</div>
          </div>
        </div>

        {/* Price Levels */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>PRICE LEVELS</div>

          {stopLoss && (
            <PriceLevel label="⛔ Stop Loss" value={stopLoss} color="var(--red)"
              pct={direction === 'LONG' ? -(riskPct) : riskPct} />
          )}
          <PriceLevel label="→ Entry (current)" value={currentPrice} color={cfg.color} isEntry />
          {target1 && (
            <PriceLevel label="🎯 Target 1 (2×ATR)" value={target1} color="var(--amber)"
              pct={direction === 'LONG' ? reward1Pct : -reward1Pct} />
          )}
          {target2 && (
            <PriceLevel label="🚀 Target 2 (3.5×ATR)" value={target2} color="var(--green)"
              pct={direction === 'LONG' ? reward2Pct : -reward2Pct} />
          )}

          {/* R:R */}
          <div style={{ marginTop: 8, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <RRBar rrRatio={rrRatio1} color={cfg.color} />
            <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11 }}>
              <span style={{ color: 'var(--text-dim)' }}>Target 1 R:R</span>
              <span style={{ color: rrRatio1 >= 2 ? 'var(--green)' : 'var(--amber)' }}>1:{rrRatio1.toFixed(2)}</span>
              <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>Target 2 R:R</span>
              <span style={{ color: rrRatio2 >= 3 ? 'var(--green)' : 'var(--amber)' }}>1:{rrRatio2.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Indicators Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {[
          { label: 'EMA 20', value: indicators.ema20?.toFixed(2), color: indicators.bullTrend ? 'var(--green)' : 'var(--red)', sub: indicators.bullTrend ? '↑ BULL' : '↓ BEAR' },
          { label: 'EMA 50', value: indicators.ema50?.toFixed(2), color: 'var(--cyan)', sub: indicators.ema20 > indicators.ema50 ? 'ABOVE' : 'BELOW' },
          { label: 'RSI 14', value: indicators.rsi14?.toFixed(1), color: indicators.rsi14 > 70 ? 'var(--red)' : indicators.rsi14 < 30 ? 'var(--green)' : 'var(--text-primary)', sub: indicators.rsi14 > 70 ? 'OVERBOUGHT' : indicators.rsi14 < 30 ? 'OVERSOLD' : 'NEUTRAL' },
          { label: 'VOL ×', value: indicators.vSurge?.toFixed(2) + '×', color: indicators.vSurge >= 1.2 ? 'var(--green)' : 'var(--text-secondary)', sub: indicators.vSurge >= 1.2 ? 'ELEVATED' : 'NORMAL' },
        ].map(m => (
          <div key={m.label} style={{
            padding: '10px 12px', background: 'var(--bg-panel)',
            border: '1px solid var(--border)', borderRadius: 6, textAlign: 'center'
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>{m.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 9, color: m.color, opacity: 0.7, marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Signal Reasons ── */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">SIGNAL BREAKDOWN</span>
          <span className={`badge ${shouldTrade ? 'badge-green' : 'badge-red'}`}>{shouldTrade ? `${score}/100 TRADE` : `${score}/100 SKIP`}</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {reasons.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 0' }}>
              <span style={{ color: 'var(--green)', fontSize: 10, flexShrink: 0 }}>✓</span>
              <span style={{ color: 'var(--text-secondary)' }}>{r}</span>
            </div>
          ))}
          {warnings.map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 0' }}>
              <span style={{ color: 'var(--amber)', fontSize: 10, flexShrink: 0 }}>⚠</span>
              <span style={{ color: 'var(--text-dim)' }}>{w}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Exit Rules ── */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">EXIT RULES</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {exitRules.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: 'var(--cyan)', flexShrink: 0 }}>→</span>
              <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{r}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '4px 8px', textAlign: 'center' }}>
        For educational use only · Not financial advice · Always use your own risk management
      </div>
    </div>
  );
}
