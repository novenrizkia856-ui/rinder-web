/**
 * Rinder core: resolved config, formatting, copy, pixel icons and the
 * state glyphs (classification, verification, confidence).
 *
 * Reads window.RINDER_CONFIG (config.js) and window.RINDER_DEMO
 * (data/demo.js). Exposes window.Rinder for the other scripts.
 * Works in Node too, so test/ can exercise the pure helpers.
 */
(function (root) {
  "use strict";

  const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  const CLUSTERS = {
    "mainnet-beta": { label: "Mainnet Beta", rpcUrl: "https://api.mainnet-beta.solana.com" },
    devnet: { label: "Devnet", rpcUrl: "https://api.devnet.solana.com" },
    testnet: { label: "Testnet", rpcUrl: "https://api.testnet.solana.com" },
  };

  /** A Solana public key is 32 bytes: 32 to 44 base58 characters. */
  function isSolanaAddress(value) {
    return typeof value === "string" && value.length >= 32 && value.length <= 44 && BASE58.test(value);
  }

  /** A transaction signature is 64 bytes: 86 to 88 base58 characters. */
  function isSignature(value) {
    return typeof value === "string" && value.length >= 86 && value.length <= 88 && BASE58.test(value);
  }

  const clean = (v) => (typeof v === "string" ? v.trim() : "");
  const address = (v) => (isSolanaAddress(clean(v)) ? clean(v) : "");

  /**
   * Normalise the raw config. Invalid addresses resolve to "" so the UI
   * shows its unconfigured state instead of a malformed value.
   */
  function resolveConfig(raw) {
    raw = raw || {};
    const solana = raw.solana || {};
    const cluster = CLUSTERS[clean(solana.cluster)] ? clean(solana.cluster) : "mainnet-beta";
    const programs = {};
    for (const [key, value] of Object.entries(raw.programs || {})) programs[key] = address(value);
    const token = raw.token || {};
    return {
      cluster,
      clusterLabel: CLUSTERS[cluster].label,
      rpcUrl: clean(solana.rpcUrl) || CLUSTERS[cluster].rpcUrl,
      explorerUrl: clean(solana.explorerUrl).replace(/\/+$/, "") || "https://explorer.solana.com",
      programs,
      token: { symbol: clean(token.symbol) || "RINDER", mint: address(token.mint) },
      apiBaseUrl: clean((raw.api || {}).baseUrl).replace(/\/+$/, ""),
      stablecoins: (raw.stablecoins || []).map((s) => ({ ...s, mint: address(s.mint) })),
      links: Object.fromEntries(Object.entries(raw.links || {}).map(([k, v]) => [k, /^https:\/\//.test(clean(v)) ? clean(v) : ""])),
    };
  }

  function explorerLink(config, kind, value) {
    if (!value) return "";
    const path = { tx: "tx", address: "address" }[kind];
    if (!path) return "";
    const cluster = config.cluster === "mainnet-beta" ? "" : `?cluster=${config.cluster}`;
    return `${config.explorerUrl}/${path}/${encodeURIComponent(value)}${cluster}`;
  }

  /** Keep both ends of a long address or signature. */
  function truncate(value, head = 6, tail = 6) {
    if (!value) return "";
    return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
  }

  const nf = new Intl.NumberFormat("en-US");
  const formatNumber = (n) => nf.format(n);
  function formatAmount(n) {
    return new Intl.NumberFormat("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
  }
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function formatDate(iso) {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  function formatTime(iso) {
    return `${formatDate(iso)}, ${iso.slice(11, 16)} UTC`;
  }

  const CLASSIFICATIONS = {
    DIRECT_PAYMENT: { label: "Direct payment", family: "pay", glyph: "101010101", desc: "Customer to merchant, no intermediary." },
    PAYMENT_GATEWAY: { label: "Payment gateway", family: "pay", glyph: "111101111", desc: "Routed through a known provider." },
    TREASURY: { label: "Treasury", family: "other", glyph: "111000111", desc: "Settlement or operational movement." },
    EXCHANGE: { label: "Exchange", family: "other", glyph: "010111010", desc: "Exchange controlled infrastructure." },
    DEFI: { label: "DeFi", family: "other", glyph: "100010001", desc: "Swaps, lending or routing programs." },
    INTERNAL_TRANSFER: { label: "Internal transfer", family: "other", glyph: "110110000", desc: "Between wallets of one owner." },
    UNKNOWN: { label: "Unknown", family: "unknown", glyph: "000010000", desc: "Not enough evidence. Said plainly." },
  };
  const VERIFICATION = {
    VERIFIED: { label: "Verified", fill: 1, desc: "Supported by authoritative evidence." },
    PARTIALLY_VERIFIED: { label: "Partially verified", fill: 0.5, desc: "Some details confirmed. Some still open." },
    STALE: { label: "Stale", fill: 1, dashed: true, desc: "Verified before. Not checked recently." },
    UNVERIFIED: { label: "Unverified", fill: 0, desc: "Evidence is insufficient." },
  };
  const CONFIDENCE = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const VERDICTS = { LIKELY_PAYMENT: "Likely payment", NOT_A_PAYMENT: "Not a payment", UNKNOWN: "Unknown" };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function clsBadge(key) {
    const c = CLASSIFICATIONS[key] || CLASSIFICATIONS.UNKNOWN;
    const cells = c.glyph.split("").map((b) => `<i${b === "1" ? ' class="on"' : ""}></i>`).join("");
    return `<span class="cls cls--${c.family}"><span class="cls__glyph" aria-hidden="true">${cells}</span>${esc(c.label)}</span>`;
  }

  /** Ring glyph, drawn on a 7 by 7 pixel grid: full ring with a core, half ring, dashed ring or sparse dots. */
  const RING = [[2, 0], [3, 0], [4, 0], [5, 1], [6, 2], [6, 3], [6, 4], [5, 5], [4, 6], [3, 6], [2, 6], [1, 5], [0, 4], [0, 3], [0, 2], [1, 1]];
  function ringSvg(key, size = 14) {
    const v = VERIFICATION[key];
    const on = (i) => !v ? i % 4 === 0 : key === "UNVERIFIED" ? i % 4 === 0 : key === "STALE" ? i % 4 < 2 : key === "PARTIALLY_VERIFIED" ? i < 8 : true;
    const cells = RING.map(([x, y], i) => `<rect x="${x}" y="${y}" width="1" height="1"${on(i) ? "" : ' opacity=".22"'}/>`).join("");
    const core = v && (key === "VERIFIED" || key === "PARTIALLY_VERIFIED") ? `<rect x="2" y="2" width="3" height="3"${key === "VERIFIED" ? "" : ' opacity=".45"'}/>` : key === "STALE" ? '<rect x="3" y="2" width="1" height="2"/><rect x="3" y="3" width="2" height="1"/>' : "";
    return `<svg viewBox="0 0 7 7" width="${size}" height="${size}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"${v ? "" : ' opacity=".7"'}>${cells}${core}</svg>`;
  }

  function vBadge(key) {
    if (!VERIFICATION[key]) return `<span class="vb vb--NONE">${ringSvg(null)}No merchant claim</span>`;
    return `<span class="vb vb--${key}">${ringSvg(key)}${esc(VERIFICATION[key].label)}</span>`;
  }

  function cBadge(key) {
    const n = CONFIDENCE[key] || 0;
    const bars = [1, 2, 3].map((i) => `<i${i <= n ? ' class="on"' : ""}></i>`).join("");
    return `<span class="cb"><span class="cb__bars" aria-hidden="true">${bars}</span>${esc(key ? key.charAt(0) + key.slice(1).toLowerCase() : "")} confidence</span>`;
  }

  /**
   * Pixel icons. Each row is a string; "#" is a lit cell. Rendered as SVG
   * rects, the same construction as the reference's pixel line icons.
   */
  const PIX = {
    arrow: ["....", ".#..", "..#.", "...#", "..#.", ".#..", "...."],
    search: ["..####..", ".#....#.", "#......#", "#......#", "#......#", ".#....#.", "..####.#", ".......#"],
    copy: ["..######", "..#....#", "###....#", "#.#....#", "#.######", "#.....#.", "#######."],
    check: ["........", ".......#", "......#.", "#....#..", ".#..#...", "..##....", "........"],
    horizon: ["..................", "......##...##.....", "....#...###...#...", "..#...#.....#...#.", ".....#.......#....", "....#.........#...", "..................", "##################"],
    scan: ["##.........##", "#...........#", "....#####....", "...#.....#...", "...#..#..#...", "...#.....#...", "....#####....", "#...........#", "##.........##"],
    coin: ["..####..", ".#....#.", "#..##..#", "#.#..#.#", "#..##..#", ".#....#.", "..####.."],
    store: ["########", "#.#.#.##", "########", ".#....#.", ".#.##.#.", ".#.##.#."],
    route: ["#.......", "##......", "#.#.....", "...#....", "....#..#", ".....#.#", "......##"],
    shield: ["########", "#......#", "#.#..#.#", "#..##..#", ".#....#.", "..#..#..", "...##..."],
    endpoint: ["...##...", "..#..#..", "...##...", "....#...", ".######.", ".#....#.", ".######."],
    minus: ["........", "........", "........", "########", "........", "........", "........"],
    plus: ["...##...", "...##...", "########", "########", "...##...", "...##...", "........"],
    clock: [".######.", "#......#", "#..#...#", "#..###.#", "#......#", "#......#", ".######."],
    swap: ["....#...", "#######.", "....#...", "........", "...#....", ".#######", "...#...."],
    x: ["...............", "#...........#..", ".#.........#...", "..#.......#....", "...#.....#.....", "....#...#......", ".....#.#.......", "......#........", ".....#.#.......", "....#...#......", "...#.....#.....", "..#.......#....", ".#.........#..."],
    github: [".######.", "#......#", "#.#..#.#", "#......#", "#.####.#", ".#....#.", "..#..#.."],
    doc: ["#####...", "#...##..", "#....#..", "#.###.#.", "#......#", "#.####.#", "########"],
  };
  function pixel(name, color = "currentColor") {
    const rows = PIX[name];
    if (!rows) return "";
    const w = rows[0].length, h = rows.length;
    let rects = "";
    rows.forEach((row, y) => {
      let x = 0;
      while (x < w) {
        if (row[x] === "#") {
          let run = 1;
          while (row[x + run] === "#") run++;
          rects += `<rect x="${x}" y="${y}" width="${run}" height="1"/>`;
          x += run;
        } else x++;
      }
    });
    return `<svg viewBox="0 0 ${w} ${h}" fill="${color}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  }

  let toastTimer;
  function toast(message) {
    const el = document.querySelector("[data-toast]");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 1800);
  }

  function copyButton(value, label) {
    return `<button class="iconbtn" type="button" data-copy="${esc(value)}" aria-label="Copy ${esc(label)}">${pixel("copy")}</button>`;
  }

  const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const api = {
    CLUSTERS, CLASSIFICATIONS, VERIFICATION, CONFIDENCE, VERDICTS,
    isSolanaAddress, isSignature, resolveConfig, explorerLink,
    truncate, formatNumber, formatAmount, formatDate, formatTime, esc,
    clsBadge, vBadge, cBadge, ringSvg, pixel, copyText, copyButton, toast, reducedMotion,
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) {
    api.config = resolveConfig(root.RINDER_CONFIG);
    api.demo = root.RINDER_DEMO || {};
    root.Rinder = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
