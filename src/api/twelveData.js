const TWELVE_DATA_API_KEY = '934f233f1c934c92a767bb9e52191d6d';  // ← your key
const BASE_URL = 'https://api.twelvedata.com';

// ── Token Bucket (8 req / 60s free tier) ─────────────────────────────────────
const BUCKET = { tokens: 8, lastRefill: Date.now(), queue: [], draining: false };

function refillTokens() {
  if (Date.now() - BUCKET.lastRefill >= 60_000) {
    BUCKET.tokens = 8;
    BUCKET.lastRefill = Date.now();
  }
}

function drainQueue() {
  if (BUCKET.draining) return;
  BUCKET.draining = true;
  const tick = () => {
    refillTokens();
    while (BUCKET.tokens > 0 && BUCKET.queue.length > 0) {
      BUCKET.tokens--;
      BUCKET.queue.shift().resolve();
    }
    if (BUCKET.queue.length > 0) setTimeout(tick, 2000);
    else BUCKET.draining = false;
  };
  tick();
}

function acquireToken() {
  refillTokens();
  if (BUCKET.tokens > 0) { BUCKET.tokens--; return Promise.resolve(); }
  return new Promise(resolve => { BUCKET.queue.push({ resolve }); drainQueue(); });
}

// ── Direct fetch — Twelve Data supports browser CORS natively ────────────────
async function tdFetch(endpoint, params, attempt = 0) {
  await acquireToken();

  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);

    if (res.status === 429) {
      const delay = Math.min(2000 * 2 ** attempt, 32_000);
      console.warn(`Twelve Data rate limit — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      return tdFetch(endpoint, params, attempt + 1);
    }

    if (res.status === 401 || res.status === 403)
      throw new Error('Invalid API key — check src/api/twelveData.js');

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message || 'Twelve Data API error');
    return data;

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out (15s)');
    if (attempt < 3 && !err.message.includes('API key') && !err.message.includes('error')) {
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
      return tdFetch(endpoint, params, attempt + 1);
    }
    throw err;
  }
}

export function getApiKey()   { return TWELVE_DATA_API_KEY; }
export function setApiKey()   {}
export function clearApiKey() {}
export function hasApiKey()   { return !!TWELVE_DATA_API_KEY && TWELVE_DATA_API_KEY !== 'YOUR_KEY_HERE'; }

export async function fetchOHLCV(symbol, outputsize = 150, interval = '1day') {
  const sym  = symbol.trim().toUpperCase();
  const data = await tdFetch('/time_series', {
    symbol:     sym,
    interval,
    outputsize: String(outputsize),
    apikey:     TWELVE_DATA_API_KEY,
    order:      'ASC',
  });

  if (!data.values?.length)
    throw new Error(`No data returned for ${sym}. Check the symbol is valid.`);

  const bars = data.values.map(v => ({
    timestamp: new Date(v.datetime).getTime(),
    date:      v.datetime.slice(0, 10),
    open:      parseFloat(v.open),
    high:      parseFloat(v.high),
    low:       parseFloat(v.low),
    close:     parseFloat(v.close),
    volume:    parseFloat(v.volume) || 0,
  })).filter(b => isFinite(b.close) && b.close > 0);

  return {
    meta: {
      symbol:       data.meta?.symbol   || sym,
      interval:     data.meta?.interval || interval,
      currency:     data.meta?.currency || 'USD',
      exchangeName: data.meta?.exchange || '',
    },
    bars,
  };
}

export async function fetchQuote(symbol) {
  const sym  = symbol.trim().toUpperCase();
  const data = await tdFetch('/quote', {
    symbol: sym,
    apikey: TWELVE_DATA_API_KEY,
  });

  return {
    symbol:        data.symbol,
    price:         parseFloat(data.close),
    previousClose: parseFloat(data.previous_close),
    change:        parseFloat(data.change),
    changePct:     parseFloat(data.percent_change),
    currency:      data.currency || 'USD',
    exchangeName:  data.exchange || '',
    marketState:   data.is_market_open ? 'REGULAR' : 'CLOSED',
    volume:        parseFloat(data.volume) || 0,
  };
}
