import {
  ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

function fmt(v) {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return v.toLocaleString();
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-bright)',
      borderRadius: 4, padding: '10px 14px', fontSize: 11, lineHeight: 1.8,
    }}>
      <div style={{ color: 'var(--cyan)', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.filter(p => p.value != null && p.dataKey !== 'volume').map(p => (
        <div key={p.dataKey} style={{ color: p.color || 'var(--text-primary)' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(4) : p.value}
        </div>
      ))}
      {d?.volume != null && (
        <div style={{ color: 'var(--text-secondary)' }}>Vol: {fmt(d.volume)}</div>
      )}
    </div>
  );
};

export function PriceChart({ bars, ofiBars, vpinSeries, swing }) {
  if (!bars?.length) return null;

  const maxBars = 90;
  const slicedBars = bars.slice(-maxBars);

  const ofiMap  = Object.fromEntries((ofiBars ?? []).slice(-maxBars).map(o => [o.date, o.ofiNorm]));
  const vpinMap = Object.fromEntries((vpinSeries ?? []).slice(-maxBars).map(v => [v.date, v.vpin]));

  const ema20Arr = swing?.indicators?.ema20arr ?? [];
  const ema50Arr = swing?.indicators?.ema50arr ?? [];
  const rsi14Arr = swing?.indicators?.rsi14arr ?? [];

  const ema20Map = Object.fromEntries(
    slicedBars.map((b, i) => [b.date, ema20Arr[ema20Arr.length - slicedBars.length + i] ?? null])
  );
  const ema50Map = Object.fromEntries(
    slicedBars.map((b, i) => [b.date, ema50Arr[ema50Arr.length - slicedBars.length + i] ?? null])
  );
  const rsiMap = Object.fromEntries(
    slicedBars.map((b, i) => [b.date, rsi14Arr[rsi14Arr.length - slicedBars.length + i] ?? null])
  );

  const chartData = slicedBars.map(b => ({
    date:  b.date.slice(5),
    open:  b.open,  high: b.high,  low: b.low,  close: b.close,
    volume: b.volume,
    ofi:   ofiMap[b.date]  ?? null,
    vpin:  vpinMap[b.date] ?? null,
    ema20: ema20Map[b.date] ?? null,
    ema50: ema50Map[b.date] ?? null,
    rsi:   rsiMap[b.date]  ?? null,
  }));

  const prices = slicedBars.map(b => b.close);
  const allPrices = [...prices];
  if (swing?.stopLoss) allPrices.push(swing.stopLoss);
  if (swing?.target2)  allPrices.push(swing.target2);
  const pMin = Math.min(...allPrices) * 0.993;
  const pMax = Math.max(...allPrices) * 1.007;

  const vpinVals = (vpinSeries ?? []).map(v => v.vpin).filter(Boolean);
  const vpinMax  = vpinVals.length ? Math.max(...vpinVals) * 1.1 : 1;
  const interval = Math.floor(chartData.length / 7);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* Price + EMA + trade levels */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">PRICE · EMA 20/50</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#00e5ff' }}>— EMA20</span>
            <span style={{ fontSize: 10, color: '#ff9800' }}>— EMA50</span>
            {swing?.stopLoss && <span style={{ fontSize: 10, color: 'var(--red)' }}>⛔ Stop</span>}
            {swing?.target1  && <span style={{ fontSize: 10, color: 'var(--amber)' }}>🎯 T1</span>}
            {swing?.target2  && <span style={{ fontSize: 10, color: 'var(--green)' }}>🚀 T2</span>}
          </div>
        </div>
        <div style={{ padding: '8px 0 0 0' }}>
          <ResponsiveContainer width="100%" height={210}>
            <ComposedChart data={chartData} margin={{ top: 6, right: 70, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00b4d8" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#00b4d8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} interval={interval} />
              <YAxis domain={[pMin, pMax]} tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={v => `$${v.toFixed(0)}`} width={54} />
              <Tooltip content={<CustomTooltip />} />

              {swing?.stopLoss && (
                <ReferenceLine y={swing.stopLoss} stroke="rgba(255,69,96,0.7)" strokeDasharray="5 3" strokeWidth={1.5}
                  label={{ value: `SL $${swing.stopLoss.toFixed(2)}`, position: 'insideRight', fill: '#ff4560', fontSize: 9 }} />
              )}
              {swing?.target1 && (
                <ReferenceLine y={swing.target1} stroke="rgba(255,193,7,0.7)" strokeDasharray="5 3" strokeWidth={1.5}
                  label={{ value: `T1 $${swing.target1.toFixed(2)}`, position: 'insideRight', fill: '#ffc107', fontSize: 9 }} />
              )}
              {swing?.target2 && (
                <ReferenceLine y={swing.target2} stroke="rgba(0,255,136,0.7)" strokeDasharray="5 3" strokeWidth={1.5}
                  label={{ value: `T2 $${swing.target2.toFixed(2)}`, position: 'insideRight', fill: '#00ff88', fontSize: 9 }} />
              )}

              <Area type="monotone" dataKey="close" fill="url(#priceGrad)" stroke="#00b4d8" strokeWidth={1.5} dot={false} name="Close" />
              <Line type="monotone" dataKey="ema20" stroke="#00e5ff" strokeWidth={1.5} dot={false} name="EMA20" connectNulls />
              <Line type="monotone" dataKey="ema50" stroke="#ff9800" strokeWidth={1.5} dot={false} name="EMA50" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={36}>
            <ComposedChart data={chartData} margin={{ top: 0, right: 70, bottom: 4, left: 8 }}>
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Bar dataKey="volume" fill="rgba(0,180,216,0.2)" name="Volume" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* RSI */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">RSI · 14</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,69,96,0.8)' }}>─ 70 OB</span>
            <span style={{ fontSize: 10, color: 'rgba(0,255,136,0.8)' }}>─ 30 OS</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={65}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 70, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} interval={interval} />
            <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={70} stroke="rgba(255,69,96,0.35)" strokeDasharray="3 3" />
            <ReferenceLine y={50} stroke="rgba(255,255,255,0.08)" />
            <ReferenceLine y={30} stroke="rgba(0,255,136,0.35)" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="rsi" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="RSI" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* OFI */}
      {Object.keys(ofiMap).length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">OFI · ORDER FLOW IMBALANCE (1h)</span>
          </div>
          <ResponsiveContainer width="100%" height={65}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 70, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} interval={interval} />
              <YAxis domain={[-1, 1]} ticks={[-1, 0, 1]} tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
              <Line type="monotone" dataKey="ofi" stroke="#00ff88" strokeWidth={1.5} dot={false} name="OFI" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* VPIN */}
      {vpinVals.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">VPIN · TOXICITY (μ+1.5σ threshold)</span>
          </div>
          <ResponsiveContainer width="100%" height={65}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 70, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id="vpinGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffc107" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#ffc107" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} interval={interval} />
              <YAxis domain={[0, vpinMax]} tick={{ fill: '#4a5568', fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="vpin" fill="url(#vpinGrad)" stroke="#ffc107" strokeWidth={1.5} dot={false} name="VPIN" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
