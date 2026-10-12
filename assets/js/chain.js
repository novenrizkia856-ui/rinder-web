/**
 * Rinder onchain reads. Plain JSON RPC eth_call against the Robinhood Chain
 * RPC in config.js, no wallet and no library.
 *
 * Active only when config.contracts.core and config.contracts.registry hold
 * deployed addresses. Until then every call resolves to null and the page
 * keeps its demo records.
 *
 * Selectors come from the rinder-contracts ABI:
 *   latest(bytes32)        0x79feb107  RinderCore
 *   classifiedTxCount()    0xa569fde9  RinderCore
 *   getEntity(bytes32)     0x53b66f36  RinderRegistry
 *   entityCount()          0x84a0a8c4  RinderRegistry
 *   endpointCount()        0xa14a9c73  RinderRegistry
 *   checkCount()           0x2b719ee2  RinderVerifier
 *   symbol(), decimals()   0x95d89b41, 0x313ce567  ERC20
 */
(function (root) {
  "use strict";
  const R = root.Rinder;
  const cfg = R.config;
  const { core, registry, verifier } = cfg.contracts;
  const enabled = Boolean(core && registry);

  // Mirrors the enums in RinderCore.sol, in declaration order.
  const CLASSIFICATIONS = ["DIRECT_PAYMENT", "PAYMENT_GATEWAY", "TREASURY", "EXCHANGE", "DEFI", "INTERNAL_TRANSFER", "UNKNOWN"];
  const CONFIDENCE = ["LOW", "MEDIUM", "HIGH"];
  const VERDICT = (c) => (c === "DIRECT_PAYMENT" || c === "PAYMENT_GATEWAY" ? "LIKELY_PAYMENT" : c === "UNKNOWN" ? "UNKNOWN" : "NOT_A_PAYMENT");
  const ZERO = "0x" + "0".repeat(64);

  let rpcId = 0;
  async function call(to, data) {
    const res = await fetch(cfg.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "eth_call", params: [{ to, data }, "latest"] }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "eth_call failed");
    return json.result || "0x";
  }

  // ABI word helpers over the hex result, without the 0x prefix
  const words = (hex) => hex.slice(2);
  const word = (h, i) => h.slice(i * 64, i * 64 + 64);
  const uint = (w) => BigInt("0x" + (w || "0"));
  const addr = (w) => "0x" + w.slice(24);
  const b32 = (w) => "0x" + w;
  function str(h, byteOffset) {
    const at = byteOffset * 2;
    const len = Number(BigInt("0x" + h.slice(at, at + 64)));
    const bytes = h.slice(at + 64, at + 64 + len * 2).match(/../g) || [];
    return new TextDecoder().decode(new Uint8Array(bytes.map((b) => parseInt(b, 16))));
  }

  /** RinderRegistry.getEntity: { kind, active, account, name, metadataURI } or null for an unknown id. */
  async function entity(id) {
    if (!id || id === ZERO) return null;
    try {
      const h = words(await call(registry, "0x53b66f36" + id.slice(2)));
      const base = Number(uint(word(h, 0)));
      const t = (i) => word(h, base / 32 + i);
      return {
        kind: Number(uint(t(0))),
        active: uint(t(1)) === 1n,
        account: addr(t(2)),
        name: str(h, base + Number(uint(t(5)))),
        metadataURI: str(h, base + Number(uint(t(6)))),
      };
    } catch {
      return null;
    }
  }

  async function token(address) {
    try {
      const [s, d] = await Promise.all([call(address, "0x95d89b41"), call(address, "0x313ce567")]);
      const h = words(s);
      return { symbol: str(h, Number(uint(word(h, 0)))), decimals: Number(uint(words(d))) };
    } catch {
      const known = cfg.stablecoins.find((c) => c.address && c.address.toLowerCase() === address.toLowerCase());
      return known ? { symbol: known.symbol, decimals: known.decimals } : null;
    }
  }

  function amount(raw, decimals) {
    const base = 10n ** BigInt(decimals);
    return Number(raw / base) + Number(raw % base) / Number(base);
  }

  /**
   * The latest RinderCore classification of a transaction, shaped like a
   * demo transaction record, or null when it was never classified.
   */
  async function transaction(hash) {
    if (!enabled || !R.isTxHash(hash)) return null;
    let h;
    try {
      h = words(await call(core, "0x79feb107" + hash.slice(2).toLowerCase()));
    } catch {
      return null; // NotClassified reverts
    }
    if (h.length < 64 * 12) return null;
    const coin = await entity(b32(word(h, 1)));
    const [merchant, provider, tk] = await Promise.all([entity(b32(word(h, 5))), entity(b32(word(h, 6))), coin ? token(coin.account) : null]);
    const classification = CLASSIFICATIONS[Number(uint(word(h, 7)))] || "UNKNOWN";
    const decimals = tk ? tk.decimals : 6;
    return {
      hash,
      label: "Onchain record",
      verdict: VERDICT(classification),
      classification,
      confidence: CONFIDENCE[Number(uint(word(h, 8)))] || "LOW",
      verification: null,
      stablecoin: tk ? tk.symbol : coin ? coin.name : "Unknown",
      amount: amount(uint(word(h, 2)), decimals),
      merchantName: merchant ? merchant.name : "",
      providerName: provider ? provider.name : "",
      wallet: addr(word(h, 3)),
      timestamp: new Date(Number(uint(word(h, 11))) * 1000).toISOString(),
      evidence: [`Evidence hash ${R.truncate(b32(word(h, 9)), 10, 6)}`, `Classified by ${R.truncate(addr(word(h, 10)), 6, 4)}`],
    };
  }

  /** Live record counts for the API section, or null when not deployed or the RPC fails. */
  async function stats() {
    if (!enabled) return null;
    try {
      const n = async (to, sel) => (to ? Number(uint(words(await call(to, sel)))) : null);
      const [txs, entities, endpoints, checks] = await Promise.all([
        n(core, "0xa569fde9"), n(registry, "0x84a0a8c4"), n(registry, "0xa14a9c73"), n(verifier, "0x2b719ee2"),
      ]);
      return { txs, entities, endpoints, checks };
    } catch {
      return null;
    }
  }

  root.RinderChain = { enabled, transaction, entity, stats };
})(window);
