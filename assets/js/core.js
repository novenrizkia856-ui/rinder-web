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

  /** Ring glyph: a full ring, half ring, dashed ring or dotted empty ring. */
  function ringSvg(key, size = 14) {
    const r = 5.5, c = 2 * Math.PI * r;
    const v = VERIFICATION[key];
    const base = `<svg viewBox="0 0 14 14" width="${size}" height="${size}" fill="none" aria-hidden="true">`;
    if (!v) return `${base}<circle cx="7" cy="7" r="${r}" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1 2.2" opacity=".7"/></svg>`;
    if (key === "UNVERIFIED") return `${base}<circle cx="7" cy="7" r="${r}" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1 2.2"/></svg>`;
    if (key === "STALE") return `${base}<circle cx="7" cy="7" r="${r}" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2"/><rect x="6.4" y="4" width="1.2" height="3.4" fill="currentColor"/><rect x="6.4" y="6.4" width="2.6" height="1.2" fill="currentColor"/></svg>`;
    const arc = v.fill * c;
    return `${base}<circle cx="7" cy="7" r="${r}" stroke="currentColor" stroke-width="1.2" opacity=".22"/><circle cx="7" cy="7" r="${r}" stroke="currentColor" stroke-width="1.6" stroke-dasharray="${arc} ${c}" transform="rotate(-90 7 7)"/>${v.fill === 1 ? '<rect x="5" y="5" width="4" height="4" fill="currentColor"/>' : ""}</svg>`;
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

  /** The Rinder mark: a pixel ring on a horizon, in the reference's tile. */
  function mark(tone = "dark") {
    const ink = tone === "light" ? "#1F2937" : "#F9FAF7";
    const tile = tone === "light" ? "rgba(31,41,55,0.06)" : "url(#rgm)";
    const u = 1.26895;
    const ring = ["..###..", ".#...#.", "#.....#", "#..#..#", "#.....#", ".#...#.", "..###.."];
    let cells = "";
    ring.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") cells += `<rect x="${(13.48 + x * u).toFixed(3)}" y="${(11.2 + y * u).toFixed(3)}" width="${u}" height="${u}"/>`; }));
    return `<svg viewBox="0 0 35 34" width="100%" height="100%" fill="none" aria-hidden="true"><defs><linearGradient id="rgm" x1="11.8" y1="0.4" x2="33.3" y2="35.4" gradientUnits="userSpaceOnUse"><stop stop-color="#F9FAF7" stop-opacity=".12"/><stop offset="1" stop-color="#F9FAF7" stop-opacity=".18"/></linearGradient></defs><rect x=".92" width="34" height="34" rx="6" fill="${tile}"/><g fill="${ink}">${cells}<rect x="6.5" y="20.99" width="22.84" height="1.27"/><rect x="8.45" y="16.55" width="2.54" height="1.27"/><rect x="24.9" y="16.55" width="2.54" height="1.27"/></g></svg>`;
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
    clsBadge, vBadge, cBadge, ringSvg, pixel, mark, copyText, copyButton, toast, reducedMotion,
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) {
    api.config = resolveConfig(root.RINDER_CONFIG);
    api.demo = root.RINDER_DEMO || {};
    root.Rinder = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
