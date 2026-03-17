# Microstructure Edge — OFI · VPIN · Kelly · HMM

> A full microstructure signal dashboard deployable to **GitHub Pages** with a permanent URL.  
> Enter any stock ticker → downloads 6 months of Yahoo Finance daily OHLCV → runs all 7 model components from `model.mmd`.

---

## Live Demo
After deployment, your app will be at:
```
https://<your-github-username>.github.io/<repo-name>/
```

---

## Model Components Implemented

| § | Model | Method |
|---|-------|--------|
| §1 | Order Flow Imbalance (OFI) | Bulk Volume Classification + depth-decay weights (λ=0.5, K=5 levels) |
| §2 | Spread Decomposition | Roll's model + H-L effective spread, adverse selection fraction |
| §3 | VPIN Toxicity | Volume-synchronized buckets (V_bucket = median_vol/50), toxic threshold = μ+2σ |
| §4 | Combined Alpha Signal | α = b₁·OFI + b₂·sign(S_adv)·√|S_adv| + b₃·(VPIN_thresh − VPIN) |
| §5 | Heston Stochastic Vol | MLE on rolling 30d windows, κ/θ/ξ/ρ parameters |
| §6 | Fractional Kelly Sizing | Bayesian P(up) posterior, f_adj = γ·f*, γ=0.33 |
| §7 | HMM Regime Detection | 3-state HMM (Trending / Mean-Reverting / Volatile), Viterbi path |

---

## Deploy to GitHub Pages in 3 Steps

### Step 1 — Create a new GitHub repository
1. Go to [github.com/new](https://github.com/new)
2. Name it (e.g. `microstructure-edge`)
3. Keep it **Public** (required for free GitHub Pages)
4. Do **not** initialize with README

### Step 2 — Push this code
```bash
git init
git add .
git commit -m "Initial commit — Microstructure Edge"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages
1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **"GitHub Actions"**
3. The workflow at `.github/workflows/deploy.yml` will automatically:
   - Build the Vite + React app
   - Inject the correct `base` path (`/<repo-name>/`)
   - Deploy to GitHub Pages
4. After ~60 seconds, your app is live at `https://<username>.github.io/<repo-name>/`

Every subsequent `git push` to `main` auto-redeploys.

---

## Local Development

```bash
npm install
npm run dev        # → http://localhost:5173
npm run build      # production build → ./dist
npm run preview    # preview production build locally
```

---

## Rate Limit Handling

Yahoo Finance is a public API with aggressive rate limiting. This app handles it via:

| Mechanism | Detail |
|-----------|--------|
| **Token bucket** | Max 5 requests per 2 seconds, queues excess |
| **3 CORS proxy chain** | `corsproxy.io` → `allorigins.win` → `thingproxy` |
| **Exponential backoff** | 429/503 → retries at 1s, 2s, 4s, 8s, 16s |
| **Per-proxy fallback** | Timeout or error on one proxy → tries next |
| **12s request timeout** | AbortController per request |

If all proxies fail, the error message explains it's likely a CORS/rate-limit issue and asks you to retry.

---

## Architecture

```
src/
├── api/
│   └── yahooFinance.js     # Rate-limited OHLCV + quote fetcher
├── models/
│   ├── ofi.js              # §1 Order Flow Imbalance (BVC method)
│   ├── vpin.js             # §3 VPIN (volume bucket accumulator)
│   ├── kelly.js            # §5 Heston vol + §6 Fractional Kelly
│   ├── hmm.js              # §7 HMM (forward + Viterbi)
│   └── alpha.js            # §4 Combined alpha signal
├── hooks/
│   └── useStockData.js     # Orchestrates all API + model calls
├── components/
│   ├── PriceChart.jsx      # Price, volume, OFI, VPIN charts (Recharts)
│   ├── SignalPanel.jsx      # Alpha signal, OFI, VPIN, spread panels
│   └── KellyRegimePanel.jsx # Kelly sizing + Heston vol + HMM regime
├── App.jsx                 # Root: search bar, layout, header
└── index.css               # Bloomberg terminal dark aesthetic
```

---

## Notes on OFI Approximation

The model specifies OFI from a limit order book (top-K levels). Since Yahoo Finance provides OHLCV only — not LOB data — we use **Bulk Volume Classification (BVC)**:

```
V_buy(t) = V(t) × Φ( ΔP(t) / σ(t) )
V_sell(t) = V(t) − V_buy(t)
```

Where `Φ` is the standard normal CDF and `σ(t)` is the rolling 20-bar return std-dev. This is a well-established approximation (Easley et al., 2012) and is the same method used to compute VPIN from daily data.

For true LOB-level OFI you would need tick data (e.g., from Polygon.io, Databento, or IEX Cloud).

---

## Disclaimer

This tool is for **educational and research purposes only**. It does not constitute financial advice. All signals are approximations derived from daily OHLCV data and should not be used to make real trading decisions without further validation.
