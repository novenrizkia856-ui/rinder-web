# Rinder Web

Landing page for **Rinder**, Solana stablecoin payment intelligence.
Plain HTML, CSS and JavaScript. No framework, no build step, no backend.

## Run locally

```bash
npm run dev      # http://127.0.0.1:5280, no caching
npm test         # config, demo data and helper tests
npm run audit    # copy rules, leftovers, stray addresses
```

Any static server works too, for example `python -m http.server 5280`.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page |
| `config.js` | **All deployment values**: cluster, RPC, explorer, program IDs, token mint, API, stablecoin mints, links |
| `data/demo.js` | Demo merchants, providers, transactions, changes and metrics. Illustrative only |
| `assets/css/rinder.css` | Styles and tokens |
| `assets/js/core.js` | Config resolution, formatting, state glyphs, pixel icons, copy |
| `assets/js/pixel.js` | Dithered pixel scenes (hero, analyzer sky, cards, footer) and the receipt art |
| `assets/js/motion.js` | Word reveals, card reveals, counters, typewriter, clock, nav theme |
| `assets/js/app.js` | Search, Token CA, analyzer, classification stepper, profiles, Solana map, verification, timeline, API status |
| `assets/fonts/` | af Another Sans and PP Mondwest, carried over from the reference design |

## Configuration

Edit `config.js` and redeploy. No HTML changes are needed.

| Key | When set | When empty |
|---|---|---|
| `token.mint` | Token CA shows the mint, copy copies it | "Coming Soon", copy stays inert |
| `programs.core`, `registry`, `verifier` | Listed as deployed with explorer links | "Not deployed" |
| `api.baseUrl` | Analyzer calls `GET {baseUrl}/v1/transactions/{signature}` first | Demo records only |
| `solana.cluster` | `mainnet-beta`, `devnet` or `testnet` | `mainnet-beta` |
| `solana.rpcUrl` | Custom RPC | Public RPC for the cluster |
| `links.x`, `github`, `docs` | Footer icon appears | Hidden |

Values that are not valid base58 addresses are ignored, so a typo falls back
to the unconfigured state. Everything in `config.js` is public. Never put a
key or secret there.

There is no Rinder token and no deployed Rinder program yet. The mint and all
program slots are intentionally empty.

## Demo data

Merchants and providers are fictional. Every demo address and signature
contains `0`, which base58 never uses, so none can match a real account or
transaction. The only real addresses are the public USDC, USDT and PYUSD
mints in `config.js`, checked against mainnet on 24 Sep 2026.

## Deploy to Vercel

Import the repository with framework preset **Other**. `vercel.json` already
sets no build command and serves the repository root. Headers include a
strict CSP (`script-src 'self'`), so keep scripts in files, not inline.
