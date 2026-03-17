/**
 * Yahoo Finance Data Fetcher
 * - CORS proxy chain: tries multiple proxies before failing
 * - Rate limiting: token bucket, max 5 requests / 2 seconds
 * - Exponential backoff on 429 / network errors
 * - Parses v8/finance/chart response into normalized OHLCV arrays
 */

// ── Rate Limiter ────────────────────────────────────────────────────────────
const RATE = {
  tokens: 5,
  maxTokens: 5,
  refillRate: 5,        // tokens per refillInterval
  refillInterval: 2000, // ms
  queue: [],
  timer: null,
};

function startRefill() {
  if (RATE.timer) return;
  RATE.timer = setInterval(() => {
    RATE.tokens = Math.min(RATE.maxTokens, RATE.tokens + RATE.refillRate);
    drainQueue();
  }, RATE.refillInterval);
}

function drainQueue() {
  while (RATE.tokens > 0 && RATE.queue.length > 0) {
    const { resolve } = RATE.queue.shift();
    RATE.tokens--;
    resolve();
  }
}

function acquireToken() {
  startRefill();
  if (RATE.tokens > 0) {
    RATE.tokens--;
    return Promise.resolve();
  }
  return new Promise((resolve) => RATE.queue.push({ resolve }));
}

// ── CORS Proxy Chain ─────────────────────────────────────────────────────────
const PROXIES = [
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
];

async function fetchWithProxy(yahooUrl, attempt = 0, proxyIdx = 0) {
  await acquireToken();

  const proxyUrl = proxyIdx < PROXIES.length
    ? PROXIES[proxyIdx](yahooUrl)
    : yahooUrl; // last resort: direct (may hit CORS on browser)

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(proxyUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeout);

    if (res.status === 429 || res.status === 503) {
      const delay = Math.min(1000 * 2 ** attempt, 16000);
      console.warn(`Rate limited (${res.status}). Retrying in ${delay}ms…`);
      await new Promise(r => setTimeout(r, delay));
      return fetchWithProxy(yahooUrl, attempt + 1, proxyIdx);
    }

    if (!res.ok) {
      if (proxyIdx < PROXIES.length - 1) {
        console.warn(`Proxy ${proxyIdx} failed (${res.status}). Trying next…`);
        return fetchWithProxy(yahooUrl, 0, proxyIdx + 1);
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const text = await res.text();
    return JSON.parse(text);

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      if (proxyIdx < PROXIES.length - 1) {
        return fetchWithProxy(yahooUrl, 0, proxyIdx + 1);
      }
      throw new Error('Request timed out on all proxies');
    }
    if (attempt < 3 && err.message !== 'Failed to fetch') {
      const delay = Math.min(500 * 2 ** attempt, 8000);
      await new Promise(r => setTimeout(r, delay));
      return fetchWithProxy(yahooUrl, attempt + 1, proxyIdx);
    }
    if (proxyIdx < PROXIES.length - 1) {
      return fetchWithProxy(yahooUrl, 0, proxyIdx + 1);
    }
    throw err;
  }
}

// ── Yahoo Finance Chart Parser ───────────────────────────────────────────────
/**
 * Fetch OHLCV data for a symbol.
 * @param {string} symbol  e.g. "AAPL"
 * @param {string} range   e.g. "6mo", "1y", "3mo"
 * @param {string} interval e.g. "1d", "1h", "1wk"
 * @returns {Promise<{meta, bars}>}
 *   bars: [{timestamp, open, high, low, close, volume}]
 */
export async function fetchOHLCV(symbol, range = '6mo', interval = '1d') {
  const sym = symbol.trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}` +
    `?interval=${interval}&range=${range}&includePrePost=false`;

  const data = await fetchWithProxy(url);

  const result = data?.chart?.result?.[0];
  if (!result) {
    const errMsg = data?.chart?.error?.description || 'Symbol not found';
    throw new Error(`Yahoo Finance: ${errMsg}`);
  }

  const { meta, timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const { open, high, low, close, volume } = quote;

  const bars = timestamp.map((ts, i) => ({
    timestamp: ts * 1000,            // ms
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    open: open[i],
    high: high[i],
    low: low[i],
    close: close[i],
    volume: volume[i],
  })).filter(b =>
    b.close != null && b.volume != null &&
    isFinite(b.close) && isFinite(b.volume) && b.volume > 0
  );

  return { meta, bars };
}

/**
 * Fetch live quote (current price, bid, ask, market cap, etc.)
 * @param {string} symbol
 */
export async function fetchQuote(symbol) {
  const sym = symbol.trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}` +
    `?interval=1d&range=1d`;

  const data = await fetchWithProxy(url);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('Quote fetch failed');

  const m = result.meta;
  return {
    symbol: m.symbol,
    price: m.regularMarketPrice,
    previousClose: m.previousClose ?? m.chartPreviousClose,
    currency: m.currency,
    exchangeName: m.exchangeName,
    marketState: m.marketState,
  };
}
