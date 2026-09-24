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

test("there is no Rinder token yet: the mint is empty and the CA reads Coming Soon", () => {
  assert.equal(RINDER_CONFIG.token.mint, "");
  assert.equal(R.resolveConfig(RINDER_CONFIG).token.mint, "");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /data-ca-value[^>]*>Coming Soon</);
});

test("no Rinder program is deployed yet: every program slot is empty", () => {
  for (const [key, id] of Object.entries(RINDER_CONFIG.programs)) assert.equal(id, "", `programs.${key}`);
  assert.equal(RINDER_CONFIG.api.baseUrl, "");
});

test("a configured mint and program ID flow through; malformed ones are ignored", () => {
  const valid = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // any well formed key
  const cfg = R.resolveConfig({ ...RINDER_CONFIG, token: { symbol: "RINDER", mint: valid }, programs: { core: valid, registry: "not an address", verifier: "0xabc" } });
  assert.equal(cfg.token.mint, valid);
  assert.equal(cfg.programs.core, valid);
  assert.equal(cfg.programs.registry, "");
  assert.equal(cfg.programs.verifier, "");
});

test("cluster, RPC and explorer resolve with safe defaults", () => {
  const cfg = R.resolveConfig({ solana: { cluster: "nope" } });
  assert.equal(cfg.cluster, "mainnet-beta");
  assert.equal(cfg.rpcUrl, "https://api.mainnet-beta.solana.com");
  assert.equal(R.explorerLink(R.resolveConfig({ solana: { cluster: "devnet" } }), "tx", "abc"), "https://explorer.solana.com/tx/abc?cluster=devnet");
  assert.equal(R.explorerLink(cfg, "address", ""), "");
});

test("stablecoin mints are well formed Solana addresses", () => {
  for (const coin of RINDER_CONFIG.stablecoins) assert.ok(R.isSolanaAddress(coin.mint), coin.symbol);
});

test("demo addresses and signatures can never be real: they are not base58", () => {
  const values = [
    ...RINDER_DEMO.merchants.map((m) => m.endpoint),
    ...RINDER_DEMO.providers.map((p) => p.address),
    ...RINDER_DEMO.transactions.flatMap((t) => [t.signature, t.wallet]),
  ];
  for (const v of values) {
    assert.ok(v.includes("0"), v);
    assert.equal(R.isSolanaAddress(v), false, v);
    assert.equal(R.isSignature(v), false, v);
  }
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

test("addresses truncate from both ends", () => {
  assert.equal(R.truncate("abcdefghijklmnopqrstuvwxyz", 4, 4), "abcd…wxyz");
  assert.equal(R.truncate("short", 4, 4), "short");
  assert.ok(R.isSignature("5".repeat(88)));
  assert.equal(R.isSignature("5".repeat(40)), false);
});
