# Rinder Web

Landing page for **Rinder**, stablecoin payment intelligence on Robinhood Chain
(EVM, chain id 4663).
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
| `config.js` | **All deployment values**: token CA, chain, RPC, explorer, Rinder contracts, API, stablecoin contracts, links |
| `data/demo.js` | Demo merchants, providers, transactions, changes and metrics. Illustrative only |
| `assets/css/rinder.css` | Styles and tokens |
| `assets/js/core.js` | Config resolution, address checks, formatting, state glyphs, pixel icons, copy |
| `assets/js/hero.js` | Hero pixel scene: transfers pass through the Rinder lens and leave sorted into the seven classifications |
| `assets/js/pixel.js` | Dithered pixel scenes (analyzer sky, cards, footer) and the receipt art |
| `assets/js/motion.js` | Word reveals, card reveals, counters, typewriter, clock, nav theme |
| `assets/js/app.js` | Search, Token CA, analyzer, classification stepper, profiles, chain map, verification, timeline, API status |
| `assets/fonts/` | af Another Sans and PP Mondwest, carried over from the reference design |

## Token CA at launch

One line at the top of `config.js`:

```js
const TOKEN_CA = "";
```

Paste the token address between the quotes, commit, push. Empty shows
"Coming Soon". Any non empty value is shown and copied exactly as typed.

## Configuration

Edit `config.js` and push. No HTML changes are needed.

| Key | When set | When empty |
|---|---|---|
| `TOKEN_CA` | Token CA shows the value, copy copies it | "Coming Soon", copy stays inert |
| `contracts.core`, `registry`, `verifier` | Listed as deployed with Blockscout links | "Not deployed" |
| `stablecoins[].address` | Token contract shown with a Blockscout link | "Not configured" |
| `api.baseUrl` | Analyzer calls `GET {baseUrl}/v1/transactions/{hash}` first | Demo records only |
| `chain.rpcUrl`, `explorerUrl` | Custom RPC or explorer | Robinhood Chain public defaults |
| `links.x`, `github`, `docs` | Footer icon appears | Hidden |

Contract and stablecoin addresses must be `0x` plus 40 hex characters.
Anything else is ignored, so a typo falls back to the unconfigured state.
The token CA is the exception: it is shown as typed. Everything in
`config.js` is public. Never put a key or secret there.

No Rinder contract and no Rinder token exist yet, and the stablecoin
contracts on Robinhood Chain are not filled in yet. Check each issuer's
contract on https://robinhoodchain.blockscout.com before pasting it.

## Demo data

Merchants and providers are fictional. Every demo address and transaction
hash starts with `0xdemo` and contains letters that are not hex, so none can
match a real account or transaction.

## Deploy to Vercel

Import the repository with framework preset **Other**. `vercel.json` already
sets no build command and serves the repository root. Headers include a
strict CSP (`script-src 'self'`), so keep scripts in files, not inline.
