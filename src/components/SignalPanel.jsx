import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

function MetricRow({ label, value, color, suffix = '' }) {
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <span className="metric-value" style={{ color: color || 'var(--text-primary)' }}>
        {value}{suffix}
      </span>
    </div>
  );
}

function Gauge({ value, max = 1, color = '#00ff88', label }) {
  const pct = Math.min(100, Math.round((Math.abs(value) / max) * 100));
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto' }}>
        <svg viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${pct * 2.01} ${200 - pct * 2.01}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexDirection: 'column',
          transform: 'rotate(0deg)'
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{pct}</span>
          <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>/ 100</span>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function AlphaBar({ value, threshold = 0.15 }) {
  const clamped = Math.max(-1, Math.min(1, value));
  const pct = ((clamped + 1) / 2) * 100;
  const color = clamped > threshold ? 'var(--green)' : clamped < -threshold ? 'var(--red)' : 'var(--amber)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
        <span style={{ color: 'var(--red)' }}>SHORT ◄</span>
        <span style={{ color, fontWeight: 700 }}>α = {value.toFixed(4)}</span>
        <span style={{ color: 'var(--green)' }}>► LONG</span>
      </div>
      <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
        <div style={{
          position: 'absolute', width: 2, height: '100%', background: 'rgba(255,255,255,0.2)',
          left: '50%', transform: 'translateX(-50%)', borderRadius: 1,
        }} />
        <div style={{
          position: 'absolute', width: 2, height: 12, top: -2,
          background: color, left: `${pct}%`, transform: 'translateX(-50%)',
          borderRadius: 1, boxShadow: `0 0 6px ${color}`,
          transition: 'left 0.5s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--text-dim)' }}>
        <span>−1</span>
        <span>θ = {threshold.toFixed(2)}</span>
        <span>+1</span>
      </div>
    </div>
  );
}

export function SignalPanel({ ofi, vpin, alpha, kelly }) {
  if (!alpha) return null;

  const { isToxic, shouldTrade, direction, strength, alpha: alphaVal, components } = alpha;
  const signalColor = isToxic ? 'var(--red)' : direction === 'LONG' ? 'var(--green)' : direction === 'SHORT' ? 'var(--red)' : 'var(--amber)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Alpha Signal Banner */}
      <div className="panel" style={{
        border: `1px solid ${signalColor}`,
        boxShadow: `0 0 20px ${signalColor}20`,
      }}>
        <div className="panel-header" style={{ background: `${signalColor}10` }}>
          <span className="panel-title" style={{ color: signalColor }}>§4 COMBINED ALPHA SIGNAL</span>
          <span className={`badge ${shouldTrade && !isToxic ? 'badge-green' : isToxic ? 'badge-red' : 'badge-amber'}`}>
            {direction}
          </span>
        </div>
        <div className="panel-body">
          <AlphaBar value={alphaVal} threshold={alpha.threshold} />
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
            {alpha.interpretation}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>b₁·OFI</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: components.c1 >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {components.c1.toFixed(4)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>b₂·√|S_adv|</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: components.c2 >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {components.c2.toFixed(4)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>b₃·ΔVPIN</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: components.c3 >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {components.c3.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* OFI Panel */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">§1 ORDER FLOW IMBALANCE</span>
          <span className={`badge ${ofi?.direction === 'BUY PRESSURE' ? 'badge-green' : ofi?.direction === 'SELL PRESSURE' ? 'badge-red' : 'badge-dim'}`}>
            {ofi?.direction ?? '—'}
          </span>
        </div>
        <div className="panel-body">
          <MetricRow label="OFI_norm (current)" value={(ofi?.current ?? 0).toFixed(4)} color={ofi?.current >= 0 ? 'var(--green)' : 'var(--red)'} />
          <MetricRow label="OFI 5-bar avg" value={(ofi?.avg5 ?? 0).toFixed(4)} color={ofi?.avg5 >= 0 ? 'var(--green)' : 'var(--red)'} />
          <MetricRow label="Buy vol ratio" value={((ofi?.buyRatio ?? 0.5) * 100).toFixed(1)} suffix="%" color="var(--cyan)" />
          <div style={{ marginTop: 10 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{
                width: `${((ofi?.buyRatio ?? 0.5)) * 100}%`,
                background: `linear-gradient(90deg, var(--red), var(--green))`,
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: 'var(--text-dim)' }}>
              <span>0% BUY</span><span>50% NEUTRAL</span><span>100% BUY</span>
            </div>
          </div>
        </div>
      </div>

      {/* VPIN Panel */}
      <div className="panel" style={{ border: vpin?.isToxic ? '1px solid var(--red)' : undefined }}>
        <div className="panel-header" style={{ background: vpin?.isToxic ? 'rgba(255,69,96,0.08)' : undefined }}>
          <span className="panel-title">§3 VPIN TOXICITY</span>
          <span className={`badge ${vpin?.isToxic ? 'badge-red' : 'badge-green'}`}>
            {vpin?.isToxic ? '⚠ TOXIC FLOW' : 'CLEAN FLOW'}
          </span>
        </div>
        <div className="panel-body">
          <MetricRow label="VPIN current" value={(vpin?.stats?.current ?? 0).toFixed(4)} color={vpin?.isToxic ? 'var(--red)' : 'var(--green)'} />
          <MetricRow label="μ_VPIN" value={(vpin?.stats?.mu ?? 0).toFixed(4)} />
          <MetricRow label="σ_VPIN" value={(vpin?.stats?.sigma ?? 0).toFixed(4)} />
          <MetricRow label="Toxic threshold (μ+2σ)" value={(vpin?.stats?.toxicThreshold ?? 0).toFixed(4)} color="var(--amber)" />
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
              <span>VPIN</span>
              <span>{((vpin?.stats?.current ?? 0) / Math.max(vpin?.stats?.toxicThreshold ?? 1, 0.01) * 100).toFixed(0)}% of toxic threshold</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{
                width: `${Math.min(100, (vpin?.stats?.current ?? 0) / Math.max(vpin?.stats?.toxicThreshold ?? 1, 0.001) * 100)}%`,
                background: vpin?.isToxic ? 'var(--red)' : 'var(--amber)',
              }} />
            </div>
          </div>
          {vpin?.isToxic && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(255,69,96,0.1)', borderRadius: 4, fontSize: 11, color: 'var(--red)' }}>
              ⚡ Position reduction triggered — VPIN exceeds μ + 2σ
            </div>
          )}
        </div>
      </div>

      {/* Spread Decomposition */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">§2 SPREAD DECOMPOSITION</span>
          <span className={`badge ${kelly?.spread?.isInformedFlow ? 'badge-amber' : 'badge-dim'}`}>
            {kelly?.spread?.isInformedFlow ? 'INFORMED FLOW' : 'NOISE FLOW'}
          </span>
        </div>
        <div className="panel-body">
          <MetricRow label="Adverse selection fraction" value={((kelly?.spread?.adverseFraction ?? 0) * 100).toFixed(1)} suffix="%" color={kelly?.spread?.isInformedFlow ? 'var(--amber)' : 'var(--text-primary)'} />
          <MetricRow label="Roll spread proxy" value={(kelly?.spread?.rollSpread ?? 0).toFixed(6)} color="var(--cyan)" />
          <MetricRow label="Effective spread (H−L)" value={(kelly?.spread?.effectiveSpread ?? 0).toFixed(4)} />
          {kelly?.spread?.isInformedFlow && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(255,193,7,0.1)', borderRadius: 4, fontSize: 11, color: 'var(--amber)' }}>
              S_adv/S_eff &gt; 0.60 → Momentum overlay active
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
