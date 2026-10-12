import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// core.js is a classic browser script with a CommonJS export for tests.
const coreModule = { exports: {} };
vm.runInNewContext(readFileSync(new URL("../assets/js/core.js", import.meta.url), "utf8"), { module: coreModule, Intl });
const R = coreModule.exports;

function load(file) {
  const window = {};
  vm.runInNewContext(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { window });
  return window;
}
const { RINDER_CONFIG } = load("config.js");
const { RINDER_DEMO } = load("data/demo.js");

const ADDR = "0x1111111111111111111111111111111111111111"; // any well formed address

test("an empty token CA reads Coming Soon; any filled value is shown as is", () => {
  const ca = (v) => R.resolveConfig({ ...RINDER_CONFIG, token: { symbol: "RINDER", address: v } }).token.address;
  assert.equal(ca(""), "");
  assert.equal(ca("   "), "");
  assert.equal(ca(null), "");
  assert.equal(ca(undefined), "");
  assert.equal(ca(` ${ADDR} `), ADDR);
  assert.equal(ca("0xabc"), "0xabc");
  assert.equal(ca("anything"), "anything");
  assert.equal(typeof RINDER_CONFIG.token.address, "string");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /data-ca-value[^>]*>Coming Soon</);
});

test("the token CA is one line at the top of config.js", () => {
  const src = readFileSync(new URL("../config.js", import.meta.url), "utf8");
  assert.match(src, /^const TOKEN_CA = .*;$/m);
  assert.match(src, /address: TOKEN_CA,/);
});

test("the site targets Robinhood Chain", () => {
  const cfg = R.resolveConfig(RINDER_CONFIG);
  assert.equal(cfg.chainName, "Robinhood Chain");
  assert.equal(cfg.chainId, 4663);
  assert.match(cfg.rpcUrl, /^https:\/\//);
  assert.match(cfg.explorerUrl, /^https:\/\/[^/]+$/);
});

test("contract slots accept 0x addresses; malformed ones are ignored", () => {
  const cfg = R.resolveConfig({ ...RINDER_CONFIG, contracts: { core: ADDR, registry: "not an address", verifier: "0xabc" } });
  assert.equal(cfg.contracts.core, ADDR);
  assert.equal(cfg.contracts.registry, "");
  assert.equal(cfg.contracts.verifier, "");
  for (const [key, a] of Object.entries(RINDER_CONFIG.contracts)) assert.ok(a === "" || R.isAddress(a), `contracts.${key}`);
});

test("chain, RPC and explorer resolve with safe defaults", () => {
  const cfg = R.resolveConfig({ chain: { chainId: "nope" } });
  assert.equal(cfg.chainId, 4663);
  assert.equal(cfg.rpcUrl, "https://rpc.mainnet.chain.robinhood.com");
  assert.equal(R.explorerLink(cfg, "tx", "0xabc"), "https://robinhoodchain.blockscout.com/tx/0xabc");
  assert.equal(R.explorerLink(cfg, "token", ADDR), `https://robinhoodchain.blockscout.com/token/${ADDR}`);
  assert.equal(R.explorerLink(cfg, "address", ""), "");
});

test("stablecoin contracts are empty or well formed 0x addresses", () => {
  for (const coin of RINDER_CONFIG.stablecoins) assert.ok(coin.address === "" || R.isAddress(coin.address), coin.symbol);
  const cfg = R.resolveConfig({ ...RINDER_CONFIG, stablecoins: [{ symbol: "USDC", address: "0x123" }] });
  assert.equal(cfg.stablecoins[0].address, "");
});

test("demo addresses and hashes can never be real: they are not hex", () => {
  const values = [
    ...RINDER_DEMO.merchants.map((m) => m.endpoint),
    ...RINDER_DEMO.providers.map((p) => p.address),
    ...RINDER_DEMO.transactions.flatMap((t) => [t.hash, t.wallet]),
  ];
  for (const v of values) {
    assert.ok(v.startsWith("0xdemo"), v);
    assert.equal(R.isAddress(v), false, v);
    assert.equal(R.isTxHash(v), false, v);
  }
  for (const m of RINDER_DEMO.merchants) assert.equal(m.endpoint.length, 42, m.endpoint);
  for (const t of RINDER_DEMO.transactions) assert.equal(t.hash.length, 66, t.hash);
});

test("demo records only use known states and resolvable references", () => {
  const ids = new Set([...RINDER_DEMO.merchants, ...RINDER_DEMO.providers].map((e) => e.id));
  const symbols = new Set(RINDER_CONFIG.stablecoins.map((c) => c.symbol));
  for (const t of RINDER_DEMO.transactions) {
    assert.ok(R.CLASSIFICATIONS[t.classification], t.classification);
    assert.ok(R.CONFIDENCE[t.confidence], t.confidence);
    assert.ok(t.verification === null || R.VERIFICATION[t.verification], String(t.verification));
    assert.ok(symbols.has(t.stablecoin), t.stablecoin);
    if (t.merchant) assert.ok(ids.has(t.merchant), t.merchant);
    if (t.provider) assert.ok(ids.has(t.provider), t.provider);
  }
  for (const c of RINDER_DEMO.changes) assert.ok(ids.has(c.entity), c.entity);
});

test("addresses truncate from both ends; hashes and addresses validate", () => {
  assert.equal(R.truncate("abcdefghijklmnopqrstuvwxyz", 4, 4), "abcd…wxyz");
  assert.equal(R.truncate("short", 4, 4), "short");
  assert.ok(R.isTxHash(`0x${"a".repeat(64)}`));
  assert.equal(R.isTxHash(`0x${"a".repeat(40)}`), false);
  assert.ok(R.isAddress(ADDR));
  assert.equal(R.isAddress(`0x${"g".repeat(40)}`), false);
});
