/** Kelly Position Sizing Panel (Model §5, §6) */
export function KellyPanel({ kelly }) {
  if (!kelly) return null;

  const { p, q, b, fFull, fAdj, gamma, vol, recommendation } = kelly;
  const recColor = fAdj < 0.01 ? 'var(--text-secondary)' : fAdj < 0.05 ? 'var(--amber)' : fAdj < 0.15 ? 'var(--cyan)' : 'var(--green)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Kelly Core */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">§6 FRACTIONAL KELLY SIZING</span>
          <span className="badge" style={{ color: recColor, background: `${recColor}15`, border: `1px solid ${recColor}40` }}>
            {recommendation}
          </span>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-base)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>f_adj (γ·f*)</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: recColor, lineHeight: 1 }}>
                {(fAdj * 100).toFixed(1)}<span style={{ fontSize: 14 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>of portfolio</div>
            </div>
            <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-base)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>f* (full Kelly)</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1 }}>
                {(fFull * 100).toFixed(1)}<span style={{ fontSize: 14 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>γ = {gamma}</div>
            </div>
          </div>

          <div style={{
            fontSize: 11, padding: '8px 12px', marginBottom: 12,
            background: 'rgba(0,180,216,0.06)', borderRadius: 4,
            borderLeft: '2px solid var(--cyan)',
            color: 'var(--text-secondary)'
          }}>
            f* = (p·b − q) / b = ({p.toFixed(3)}·{b.toFixed(3)} − {q.toFixed(3)}) / {b.toFixed(3)} = {fFull.toFixed(4)}<br/>
            f_adj = {gamma} × {fFull.toFixed(4)} = <strong style={{ color: recColor }}>{fAdj.toFixed(4)}</strong>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>BAYESIAN POSTERIOR</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'P(up)', value: (p * 100).toFixed(1) + '%', color: 'var(--green)' },
              { label: 'P(dn)', value: (q * 100).toFixed(1) + '%', color: 'var(--red)' },
              { label: 'Payoff ratio b', value: b.toFixed(3), color: 'var(--cyan)' },
            ].map(m => (
              <div key={m.label} style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--bg-base)', borderRadius: 4 }}>
                <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Heston Vol */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">§5 HESTON STOCHASTIC VOLATILITY</span>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ padding: 10, background: 'var(--bg-base)', borderRadius: 6, textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>σ_annualized</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--amber)' }}>
                {(vol.annualVol * 100).toFixed(1)}<span style={{ fontSize: 11 }}>%</span>
              </div>
            </div>
            <div style={{ padding: 10, background: 'var(--bg-base)', borderRadius: 6, textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>σ_daily</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cyan)' }}>
                {(vol.dailyVol * 100).toFixed(2)}<span style={{ fontSize: 11 }}>%</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, padding: '8px 12px', background: 'rgba(0,180,216,0.06)', borderRadius: 4, borderLeft: '2px solid var(--cyan)', color: 'var(--text-secondary)' }}>
            <div>κ (mean-reversion speed) = <strong style={{ color: 'var(--text-primary)' }}>{vol.kappa.toFixed(2)}</strong></div>
            <div>θ (long-run variance) = <strong style={{ color: 'var(--text-primary)' }}>{vol.theta.toFixed(4)}</strong></div>
            <div>ξ (vol-of-vol) = <strong style={{ color: 'var(--text-primary)' }}>{vol.xi.toFixed(2)}</strong></div>
            <div>ρ (leverage effect) = <strong style={{ color: 'var(--text-primary)' }}>{vol.rho.toFixed(2)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** HMM Regime Panel (Model §7) */
export function RegimePanel({ regime }) {
  if (!regime) return null;

  const { currentRegime, strategy, distribution } = regime;

  const regimeConfig = {
    TRENDING:       { color: 'var(--green)',  icon: '↗', label: 'TRENDING',       bg: 'rgba(0,255,136,0.06)' },
    MEAN_REVERTING: { color: 'var(--cyan)',   icon: '⇌', label: 'MEAN REVERTING', bg: 'rgba(0,180,216,0.06)' },
    VOLATILE:       { color: 'var(--red)',    icon: '⚡', label: 'VOLATILE',       bg: 'rgba(255,69,96,0.06)' },
  };

  const cfg = regimeConfig[currentRegime] ?? regimeConfig.VOLATILE;

  return (
    <div className="panel" style={{ border: `1px solid ${cfg.color}30` }}>
      <div className="panel-header" style={{ background: cfg.bg }}>
        <span className="panel-title">§7 HMM REGIME · VITERBI PATH</span>
        <span className="badge" style={{ color: cfg.color, background: `${cfg.color}15`, border: `1px solid ${cfg.color}40` }}>
          {cfg.icon} {cfg.label}
        </span>
      </div>
      <div className="panel-body">

        {/* Current regime big display */}
        <div style={{ textAlign: 'center', padding: '16px 0 20px', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 8 }}>{cfg.icon}</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: cfg.color, letterSpacing: '0.05em' }}>
            {cfg.label}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            Strategy overlay: <strong style={{ color: cfg.color }}>{strategy?.overlay}</strong>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
            Kelly size multiplier: <strong style={{ color: cfg.color }}>{strategy?.kellySizeMultiplier}×</strong>
          </div>
        </div>

        {/* State distribution */}
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>STATE DISTRIBUTION (last 20 bars)</div>
        {distribution.map(d => {
          const dcfg = regimeConfig[d.regime];
          return (
            <div key={d.regime} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: dcfg?.color }}>{dcfg?.icon} {d.regime}</span>
                <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>{(d.fraction * 100).toFixed(0)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${d.fraction * 100}%`, background: dcfg?.color }} />
              </div>
            </div>
          );
        })}

        {/* Strategy description */}
        <div style={{ marginTop: 12, padding: '8px 12px', background: `${cfg.color}10`, borderRadius: 4, borderLeft: `2px solid ${cfg.color}`, fontSize: 11 }}>
          {currentRegime === 'TRENDING' && <span>Momentum overlay active — trade in direction of OFI signal.</span>}
          {currentRegime === 'MEAN_REVERTING' && <span>Contrarian OFI — fade extreme order flow imbalances.</span>}
          {currentRegime === 'VOLATILE' && <span>Reduce position to γ×0.5 Kelly. Risk management priority.</span>}
        </div>
      </div>
    </div>
  );
}
