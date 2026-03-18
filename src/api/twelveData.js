/**
 * Twelve Data API Client
 *
 * Docs: https://twelvedata.com/docs
 * Free tier: 8 requests/min · 800 requests/day
 *
 * Rate limiter  : token bucket — 8 tokens / 60s
 * Retry         : exponential backoff on 429 / 5xx
 * Timeout       : 15s per request
 * API key       : stored in localStorage under 'td_api_key'
 */

const BASE_URL   = 'https://api.twelvedata.com';
const MAX_TOKENS = 8;
const REFILL_MS  = 60_000; // 1 minute window

// ── Token Bucket ────────────────────────────────────────────────────────────
const BUCKET = {
  tokens: MAX_TOKENS,
  lastRefill: Date.now(),
  queue: [],
  draining: false,
};

function refillTokens() {
  const now = Date.now();
  const elapsed = now - BUCKET.lastRefill;
  if (elapsed >= REFILL_MS) {
    BUCKET.tokens = MAX_TOKENS;
    BUCKET.lastRefill = now;
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
    if (BUCKET.queue.length > 0) {
      setTimeout(tick, 500);
    } else {
      BUCKET.draining = false;
    }
  };
  tick();
}

function acquireToken() {
  refillTokens();
  if (BUCKET.tokens > 0) {
    BUCKET.tokens--;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    BUCKET.queue.push({ resolve });
    drainQueue();
  });
}

// ── Core Fetch ───────────────────────────────────────────────────────────────
async function tdFetch(endpoint, params, attempt = 0) {
  await acquireToken();

  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    // Rate limited
    if (res.status === 429) {
      const delay = Math.min(2000 * 2 ** attempt, 32_000);
      console.warn(`Twelve Data 429 — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      return tdFetch(endpoint, params, attempt + 1);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    // Twelve Data wraps errors in the body
    if (data.status === 'error') {
      throw new Error(data.message || 'Twelve Data API error');
    }

    return data;

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out (15s)');
    if (attempt < 3 && !err.message.includes('API error')) {
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
      return tdFetch(endpoint, params, attempt + 1);
    }
    throw err;
  }
}

// ── API Key Helpers ──────────────────────────────────────────────────────────
const KEY_STORAGE = 'td_api_key';

export function getApiKey()         { return localStorage.getItem(KEY_STORAGE) || ''; }
export function setApiKey(key)      { localStorage.setItem(KEY_STORAGE, key.trim()); }
export function clearApiKey()       { localStorage.removeItem(KEY_STORAGE); }
export function hasApiKey()         { return !!getApiKey(); }

// ── OHLCV Fetch ──────────────────────────────────────────────────────────────
/**
 * Fetch OHLCV bars from Twelve Data.
 *
 * @param {string} symbol      e.g. "AAPL"
 * @param {number} outputsize  number of bars to fetch (max 5000 on paid, 500 on free)
 * @param {string} interval    "1day" | "1h" | "4h" | "1week"
 * @param {string} [apiKey]    override stored key
 * @returns {Promise<{meta, bars}>}
 *   bars: [{timestamp, date, open, high, low, close, volume}]  chronological order
 */
export async function fetchOHLCV(symbol, outputsize = 150, interval = '1day', apiKey) {
  const key = apiKey || getApiKey();
  if (!key) throw new Error('No Twelve Data API key set. Please enter your API key.');

  const sym = symbol.trim().toUpperCase();

  const data = await tdFetch('/time_series', {
    symbol:     sym,
    interval,
    outputsize: String(outputsize),
    apikey:     key,
    order:      'ASC',          // oldest-first — consistent with our model expectations
  });

  if (!data.values?.length) {
    throw new Error(`No data returned for ${sym}. Check symbol or plan limits.`);
  }

  const bars = data.values.map(v => {
    const ts = new Date(v.datetime).getTime();
    return {
      timestamp: ts,
      date: v.datetime.slice(0, 10),      // YYYY-MM-DD
      open:   parseFloat(v.open),
      high:   parseFloat(v.high),
      low:    parseFloat(v.low),
      close:  parseFloat(v.close),
      volume: parseFloat(v.volume) || 0,
    };
  }).filter(b =>
    isFinite(b.close) && isFinite(b.volume) &&
    b.close > 0 && b.volume >= 0
  );

  const meta = {
    symbol:       data.meta?.symbol    || sym,
    interval:     data.meta?.interval  || interval,
    currency:     data.meta?.currency  || 'USD',
    exchangeName: data.meta?.exchange  || '',
    marketState:  'UNKNOWN',            // TD doesn't return market state in time_series
  };

  return { meta, bars };
}

/**
 * Fetch latest quote (price + change).
 * Uses the /quote endpoint for real-time data.
 *
 * @param {string} symbol
 * @param {string} [apiKey]
 */
export async function fetchQuote(symbol, apiKey) {
  const key = apiKey || getApiKey();
  if (!key) throw new Error('No API key');

  const sym = symbol.trim().toUpperCase();
  const data = await tdFetch('/quote', {
    symbol: sym,
    apikey: key,
  });

  return {
    symbol:        data.symbol,
    price:         parseFloat(data.close),
    previousClose: parseFloat(data.previous_close),
    change:        parseFloat(data.change),
    changePct:     parseFloat(data.percent_change),
    currency:      data.currency || 'USD',
    exchangeName:  data.exchange,
    marketState:   data.is_market_open ? 'REGULAR' : 'CLOSED',
    volume:        parseFloat(data.volume),
    fiftyTwoWeekHigh: parseFloat(data.fifty_two_week?.high),
    fiftyTwoWeekLow:  parseFloat(data.fifty_two_week?.low),
  };
}
