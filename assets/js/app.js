/**
 * Rinder landing interactions.
 *
 * Data flows through `data` below: the Rinder API when api.baseUrl is
 * configured, local demo records otherwise. Nothing here hardcodes an
 * address. Mints come from config.stablecoins, Rinder program IDs and the
 * token mint from config.programs and config.token.
 */
(function () {
  "use strict";
  const R = window.Rinder;
  const M = window.RinderMotion;
  const P = window.RinderPixel;
  const cfg = R.config;
  const demo = R.demo;
  const { esc, pixel } = R;
  const still = R.reducedMotion();

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const merchants = demo.merchants || [];
  const providers = demo.providers || [];
  const transactions = demo.transactions || [];
  const coins = cfg.stablecoins;
  const merchantById = (id) => merchants.find((m) => m.id === id);
  const providerById = (id) => providers.find((p) => p.id === id);
  const coinBySymbol = (s) => coins.find((c) => c.symbol === s);

  /* ---------------- Data access: API first, demo fallback ---------------- */

  const data = {
    live: Boolean(cfg.apiBaseUrl),
    async get(path) {
      const res = await fetch(`${cfg.apiBaseUrl}${path}`, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    async transaction(signature) {
      if (this.live && R.isSignature(signature)) {
        try { return { record: await this.get(`/v1/transactions/${encodeURIComponent(signature)}`), source: "api" }; } catch { /* fall back */ }
      }
      const record = transactions.find((t) => t.signature === signature) || (signature.length >= 8 && transactions.find((t) => t.signature.startsWith(signature)));
      return { record: record || null, source: "demo" };
    },
  };

  /* ---------------- Static decoration ---------------- */

  function decorate() {
    $$("[data-pixicon]").forEach((el) => (el.innerHTML = pixel(el.dataset.pixicon)));
    $$("[data-arrow]").forEach((el) => (el.innerHTML = pixel("arrow")));
    $$("[data-scene]").forEach((c) => P.mountScene(c));
    $$("[data-pixelart]").forEach((c) => P.mountPixelArt(c));
    $$("[data-vbadge]").forEach((el) => (el.outerHTML = R.vBadge(el.dataset.vbadge)));
    $$("[data-cbadge]").forEach((el) => (el.outerHTML = R.cBadge(el.dataset.cbadge)));
  }

  /* ---------------- Copy (delegated) ---------------- */

  function copyHandler() {
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-copy]");
      if (!btn) return;
      const ok = await R.copyText(btn.dataset.copy);
      R.toast(ok ? "Copied" : "Copy failed");
    });
  }

  /* ---------------- Token CA ---------------- */

  function tokenCA() {
    const value = $("[data-ca-value]");
    const btn = $("[data-ca-copy]");
    const text = $("[data-ca-copy-text]");
    if (!value || !btn) return;
    const mint = cfg.token.mint;
    if (mint) {
      value.textContent = R.truncate(mint, 8, 8);
      value.title = mint;
      value.classList.remove("is-soon");
      btn.removeAttribute("aria-disabled");
      btn.setAttribute("aria-label", `Copy ${cfg.token.symbol} mint address`);
    } else {
      value.textContent = "Coming Soon";
      value.title = "";
      value.classList.add("is-soon");
      btn.setAttribute("aria-disabled", "true");
      btn.setAttribute("aria-label", "Copy token CA. Not available yet");
    }
    btn.addEventListener("click", async () => {
      if (!cfg.token.mint) {
        text.textContent = "Soon";
        R.toast("The token CA is not live yet");
        setTimeout(() => (text.textContent = "Copy"), 1600);
        return;
      }
      const ok = await R.copyText(cfg.token.mint);
      btn.classList.toggle("is-copied", ok);
      text.textContent = ok ? "Copied" : "Failed";
      setTimeout(() => { text.textContent = "Copy"; btn.classList.remove("is-copied"); }, 1600);
    });
  }

  /* ---------------- Search ---------------- */

  function buildIndex() {
    const idx = [];
    for (const m of merchants) {
      const p = providerById(m.provider);
      idx.push({ kind: "Merchant", icon: "store", title: m.name, sub: `${m.stablecoins.join(", ")} · ${p ? p.name : "Direct"} · ${m.region}`, keys: [m.name, m.category, m.region, m.endpoint], go: () => openProfile("merchant", m.id) });
    }
    for (const c of coins) {
      idx.push({ kind: "Stablecoin", icon: "coin", title: `${c.symbol} · ${c.name}`, sub: `Mint ${R.truncate(c.mint, 4, 4)} · ${c.tokenProgram}`, keys: [c.symbol, c.name, c.issuer, c.mint], go: () => openProfile("stablecoin", c.symbol) });
    }
    for (const p of providers) {
      idx.push({ kind: "Provider", icon: "route", title: p.name, sub: `${R.formatNumber(p.merchants)} merchants · ${p.stablecoins.join(", ")}`, keys: [p.name, p.address, ...p.regions], go: () => openProfile("provider", p.id) });
    }
    for (const t of transactions) {
      idx.push({ kind: "Transaction", icon: "scan", title: t.label, sub: R.truncate(t.signature, 10, 6), keys: [t.signature, t.label, t.wallet, t.stablecoin], go: () => analyze(t.signature, true) });
    }
    const programs = new Set(transactions.flatMap((t) => t.programs).concat((demo.solana?.programs || []).map((p) => p.name)));
    for (const name of programs) {
      idx.push({ kind: "Program", icon: "endpoint", title: name, sub: "Program interactions on Solana", keys: [name], go: () => focusProgram(name) });
    }
    return idx;
  }

  const KIND_ORDER = ["Merchant", "Stablecoin", "Provider", "Transaction", "Program"];
  const KIND_BOOST = { Merchant: 12, Stablecoin: 12, Provider: 10, Transaction: 0, Program: 2 };

  function searchIndex(index, q) {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const scored = [];
    for (const item of index) {
      let best = 0;
      for (const key of item.keys) {
        const k = String(key || "").toLowerCase();
        if (!k) continue;
        if (k === query) best = Math.max(best, 100);
        else if (k.startsWith(query)) best = Math.max(best, 70);
        else if (k.split(/\s+/).some((w) => w.startsWith(query))) best = Math.max(best, 55);
        else if (query.length > 2 && k.includes(query)) best = Math.max(best, 35);
      }
      if (best) scored.push([best + (KIND_BOOST[item.kind] || 0), item]);
    }
    // Best matches first, then grouped by kind so each group heading shows once
    const top = scored.sort((a, b) => b[0] - a[0]).slice(0, 9).map((s) => s[1]);
    return top.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  }

  function search() {
    const form = $("[data-search]");
    if (!form) return;
    const input = $("#search-input");
    const list = $("#search-results");
    const index = buildIndex();
    let items = [], active = -1;
    const placeholder = () => (input.placeholder = innerWidth < 440 ? "Merchant, stablecoin or signature" : "Search merchant, stablecoin or transaction");
    placeholder();
    addEventListener("resize", placeholder);

    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
    const setActive = (i) => {
      active = i;
      $$(".sr", list).forEach((el, n) => el.setAttribute("aria-selected", n === i ? "true" : "false"));
      if (i < 0) return;
      input.setAttribute("aria-activedescendant", `sr-${i}`);
      const el = $(`#sr-${i}`);
      if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop - 6;
      else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 6;
    };
    const choose = (i) => { const item = items[i]; if (!item) return; close(); input.blur(); item.go(); };

    const render = () => {
      const q = input.value;
      items = searchIndex(index, q);
      const trimmed = q.trim();
      if (!items.length && R.isSignature(trimmed)) items = [{ kind: "Signature", icon: "scan", title: "Analyze this signature", sub: R.truncate(trimmed, 10, 6), go: () => analyze(trimmed, true) }];
      else if (!items.length && R.isSolanaAddress(trimmed)) items = [{ kind: "Address", icon: "endpoint", title: "Address not in demo data", sub: data.live ? "Lookups use the Rinder API" : "Live address lookups arrive with the API", go: () => R.toast("Not in demo data") }];
      if (!trimmed) return close();
      let html = "", group = "";
      items.forEach((it, i) => {
        if (it.kind !== group) { group = it.kind; html += `<div class="search__group" role="presentation">${esc(group)}s</div>`; }
        html += `<button type="button" class="sr" role="option" id="sr-${i}" aria-selected="false" data-i="${i}"><span class="sr__icon">${pixel(it.icon)}</span><span class="sr__main"><span class="sr__title">${esc(it.title)}</span><span class="sr__sub">${esc(it.sub)}</span></span><span class="sr__kind">${esc(it.kind)}</span></button>`;
      });
      list.innerHTML = html || `<p class="search__empty">No demo record matches. Try a merchant, USDC or a provider.</p>`;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      setActive(items.length ? 0 : -1);
    };

    input.addEventListener("input", render);
    input.addEventListener("focus", () => input.value.trim() && render());
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) render(); setActive(Math.min(items.length - 1, active + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(0, active - 1)); }
      else if (e.key === "Escape") { close(); }
    });
    form.addEventListener("submit", (e) => { e.preventDefault(); if (active >= 0) choose(active); else if (items.length) choose(0); });
    list.addEventListener("mousedown", (e) => e.preventDefault());
    list.addEventListener("click", (e) => { const b = e.target.closest(".sr"); if (b) choose(Number(b.dataset.i)); });
    input.addEventListener("blur", () => setTimeout(close, 120));
    $$(".search__hints .hint").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.query; input.focus(); render(); }));
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus({ preventScroll: true }); if (scrollY > innerHeight) scrollTo({ top: 0, behavior: still ? "auto" : "smooth" }); }
    });
    $$("[data-focus-search]").forEach((a) => a.addEventListener("click", () => setTimeout(() => input.focus({ preventScroll: true }), still ? 0 : 700)));
  }

  /* ---------------- Metrics ---------------- */

  function metrics() {
    const dl = $("[data-metrics]");
    if (!dl) return;
    dl.innerHTML = (demo.metrics || []).map((m) => `<div class="metric"><dt>${esc(m.label)}</dt><dd data-count="${m.value}">${m.suffix ? `<small>${esc(m.suffix)}</small>` : ""}</dd></div>`).join("");
    $$("[data-count]", dl).forEach((el) => M.countUp(el, Number(el.dataset.count)));
  }

  /* ---------------- Classification stepper ---------------- */

  const STEPS = [
    { title: "Observe", body: "A USDC transfer lands on Solana." },
    { title: "Resolve", body: "Token accounts map to owners and programs." },
    { title: "Match", body: "Known merchants and providers are checked." },
    { title: "Weigh", body: "DeFi, exchange and treasury signals are compared." },
    { title: "Classify", body: "A category, a confidence level and the evidence." },
  ];

  function pipelineSvg(vertical) {
    const t = transactions[0];
    const coin = coinBySymbol(t.stablecoin);
    const m = merchantById(t.merchant), p = providerById(t.provider);
    const W = vertical ? 320 : 640, H = vertical ? 470 : 360, w = vertical ? 138 : 140, h = 52;
    const pos = vertical
      ? [[14, 20], [168, 20], [14, 108], [168, 108], [14, 196], [168, 196], [60, 290]]
      : [[16, 36], [16, 148], [176, 36], [176, 148], [336, 36], [336, 148], [490, 86]];
    const nodes = [
      { k: "SIGNATURE", v: R.truncate(t.signature, 7, 4), step: 0 },
      { k: "TRANSFER", v: `${R.formatAmount(t.amount)} ${t.stablecoin}`, step: 0 },
      { k: "SOURCE OWNER", v: "Customer wallet", step: 1 },
      { k: "DEST OWNER", v: p.name, step: 1 },
      { k: "MERCHANT", v: m.name, step: 2 },
      { k: "SIGNALS", v: "Memo match", step: 3 },
      { k: "HIGH CONFIDENCE", v: "Payment gateway", step: 4, out: true },
    ];
    const edges = [[0, 1, 0], [1, 2, 1], [1, 3, 1], [3, 4, 2], [2, 5, 3], [4, 6, 4], [5, 6, 4]];
    const centre = (i, side) => {
      const [x, y] = pos[i];
      const nw = nodes[i].out && vertical ? 200 : w, nh = nodes[i].out ? 62 : h;
      return side === "r" ? [x + nw, y + nh / 2] : side === "l" ? [x, y + nh / 2] : side === "b" ? [x + nw / 2, y + nh] : [x + nw / 2, y];
    };
    const path = ([a, b]) => {
      const [ax, ay] = pos[a], [bx, by] = pos[b];
      let s, e;
      if (Math.abs(ax - bx) < 10) { s = centre(a, ay < by ? "b" : "t"); e = centre(b, ay < by ? "t" : "b"); }
      else if (vertical) { s = centre(a, "b"); e = centre(b, "t"); }
      else { s = centre(a, "r"); e = centre(b, "l"); }
      const mx = (s[0] + e[0]) / 2, my = (s[1] + e[1]) / 2;
      return vertical || Math.abs(ax - bx) < 10 ? `M${s[0]} ${s[1]} C${s[0]} ${my} ${e[0]} ${my} ${e[0]} ${e[1]}` : `M${s[0]} ${s[1]} C${mx} ${s[1]} ${mx} ${e[1]} ${e[0]} ${e[1]}`;
    };
    let svg = `<defs><linearGradient id="scanGrad" x1="0" x2="1"><stop offset="0" stop-color="#0081c0" stop-opacity="0"/><stop offset="1" stop-color="#0081c0" stop-opacity=".1"/></linearGradient></defs>`;
    for (let gx = 0; gx <= W; gx += 20) svg += `<line class="grid" x1="${gx}" y1="0" x2="${gx}" y2="${H}"/>`;
    for (let gy = 0; gy <= H; gy += 20) svg += `<line class="grid" x1="0" y1="${gy}" x2="${W}" y2="${gy}"/>`;
    edges.forEach((ed, i) => (svg += `<path class="edge" id="pe${i}" data-step="${ed[2]}" d="${path(ed)}"/>`));
    nodes.forEach((n, i) => {
      const [x, y] = pos[i];
      const nw = n.out && vertical ? 200 : w, nh = n.out ? 62 : h;
      svg += `<g class="node${n.out ? " out" : ""}" data-step="${n.step}"><rect x="${x}" y="${y}" width="${nw}" height="${nh}" rx="8"/><text x="${x + 12}" y="${y + 20}">${esc(n.k)}</text><text class="t2" x="${x + 12}" y="${y + 38}">${esc(n.v)}</text>${n.out ? `<text x="${x + 12}" y="${y + 54}" style="font-size:9px;fill:#a0d7d1">${esc(coin ? coin.symbol : "")} · VERIFIED</text>` : ""}</g>`;
    });
    const by = vertical ? 400 : 300;
    const stepW = (W - 40) / STEPS.length;
    STEPS.forEach((s, i) => {
      svg += `<g class="node" data-step="${i}"><rect x="${20 + i * stepW}" y="${by}" width="${stepW - 6}" height="3" rx="1.5" style="stroke:none;fill:#2c2c2c"/><text x="${20 + i * stepW}" y="${by + 22}" style="font-size:10px">${String(i + 1).padStart(2, "0")}${vertical ? "" : ` ${esc(s.title.toUpperCase())}`}</text></g>`;
    });
    if (!still) svg += `<circle class="pulse" r="3.5" data-pulse><animateMotion dur="1.6s" repeatCount="indefinite" rotate="auto"><mpath href="#pe0"/></animateMotion></circle>`;
    return { svg, viewBox: `0 0 ${W} ${H}` };
  }

  function classification() {
    const section = $("[data-classify]");
    if (!section) return;
    const ticks = $("[data-step-ticks]");
    const title = $("[data-step-title]"), body = $("[data-step-body]");
    const text = $(".classify__text");
    const svg = $("[data-pipeline]");
    let current = -1, vertical = null;

    ticks.innerHTML = STEPS.map((s, i) => `<button type="button" role="tab" aria-selected="false" aria-label="Step ${i + 1}: ${esc(s.title)}"><i></i></button>`).join("");
    const tickBtns = $$("button", ticks);

    const draw = () => {
      const v = svg.getBoundingClientRect().width < 520;
      if (v === vertical) return;
      vertical = v;
      const { svg: markup, viewBox } = pipelineSvg(v);
      svg.setAttribute("viewBox", viewBox);
      svg.innerHTML = markup;
      const s = current; current = -1; set(Math.max(0, s), true);
    };

    function set(i, silent) {
      if (i === current) return;
      current = i;
      tickBtns.forEach((b, n) => { b.setAttribute("aria-selected", n === i ? "true" : "false"); b.classList.toggle("done", n < i); });
      const apply = () => { title.textContent = STEPS[i].title; body.textContent = STEPS[i].body; text.classList.remove("is-swapping"); };
      if (silent || still) apply(); else { text.classList.add("is-swapping"); setTimeout(apply, 180); }
      $$(".node", svg).forEach((n) => { const s = Number(n.dataset.step); n.classList.toggle("on", s <= i); n.classList.toggle("focus", s === i); });
      $$(".edge", svg).forEach((e) => e.classList.toggle("on", Number(e.dataset.step) <= i && Number(e.dataset.step) >= i - 1));
      const pulse = $("[data-pulse] mpath", svg);
      if (pulse) {
        const edge = $$(".edge", svg).filter((e) => Number(e.dataset.step) === i).pop();
        if (edge) pulse.setAttribute("href", `#${edge.id}`);
      }
    }

    const scrub = matchMedia("(min-width: 1024px)");
    let auto = null, visible = false, userHold = 0;
    const startAuto = () => {
      clearInterval(auto);
      if (still) return;
      auto = setInterval(() => { if (visible && Date.now() > userHold) set((current + 1) % STEPS.length); }, 3200);
    };
    // Progress runs over the stretch where the pin is stuck inside its track.
    const track = $("[data-classify-track]"), pin = $(".classify__pin");
    const pinned = () => {
      const r = track.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      return { r, top, span: Math.max(1, (r.height - pin.offsetHeight) * 0.9) };
    };
    const onScroll = () => {
      if (!section.classList.contains("is-scrub")) return;
      const { r, top, span } = pinned();
      const p = Math.min(0.999, Math.max(0, (top - r.top) / span));
      set(Math.floor(p * STEPS.length));
    };
    const mode = () => {
      const on = scrub.matches && !still;
      section.classList.toggle("is-scrub", on);
      if (on) { clearInterval(auto); onScroll(); } else startAuto();
      draw();
    };

    tickBtns.forEach((b, i) => b.addEventListener("click", () => {
      if (section.classList.contains("is-scrub")) {
        const { r, top, span } = pinned();
        scrollTo({ top: scrollY + r.top - top + ((i + 0.5) / STEPS.length) * span, behavior: "smooth" });
      } else { userHold = Date.now() + 8000; set(i); }
    }));
    new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.3 }).observe(section);
    addEventListener("scroll", () => requestAnimationFrame(onScroll), { passive: true });
    scrub.addEventListener("change", mode);
    new ResizeObserver(() => draw()).observe(svg);
    mode();

    const cats = $("[data-categories]");
    cats.innerHTML = Object.entries(R.CLASSIFICATIONS).map(([k, c]) => `<li class="category">${R.clsBadge(k)}<p>${esc(c.desc)}</p></li>`).join("");
  }

  /* ---------------- Transaction analyzer ---------------- */

  const SCAN_STEPS = ["Reading transaction", "Resolving token accounts", "Matching entities", "Weighing evidence"];

  function field(label, value) {
    return `<div class="kv"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
  }
  const addr = (value, label, link) => `<span class="mono trunc" title="${esc(value)}">${esc(R.truncate(value, 8, 6))}</span>${R.copyButton(value, label)}${link ? `<a class="iconbtn" href="${esc(link)}" target="_blank" rel="noopener" aria-label="Open ${esc(label)} in explorer">${pixel("arrow")}</a>` : ""}`;

  function renderResult(t, source) {
    const coin = coinBySymbol(t.stablecoin);
    const m = t.merchant && merchantById(t.merchant);
    const p = t.provider && providerById(t.provider);
    const time = t.timestamp ? R.formatTime(t.timestamp) : "";
    return `
      <div class="result__head">
        <span class="result__icon">${pixel(t.verdict === "LIKELY_PAYMENT" ? "coin" : t.verdict === "UNKNOWN" ? "scan" : "swap")}</span>
        <span class="result__title">Transaction intelligence</span>
        <span class="result__time">${t.miss ? "No record" : source === "api" ? "Live" : "Demo record"}</span>
      </div>
      <p class="verdict verdict--${esc(t.verdict)}">${esc(R.VERDICTS[t.verdict] || "Unknown")}</p>
      <div class="result__badges">${R.clsBadge(t.classification)}${R.cBadge(t.confidence)}${R.vBadge(t.verification)}</div>
      <dl>
        ${t.miss ? "" : field("Stablecoin", coin ? `${esc(coin.symbol)} <span class="mini__muted">· ${esc(coin.tokenProgram)}</span>` : esc(t.stablecoin || "Unknown"))}
        ${coin && coin.mint ? field("Mint", addr(coin.mint, `${coin.symbol} mint address`, R.explorerLink(cfg, "address", coin.mint))) : ""}
        ${t.amount != null ? field("Observed amount", `<span class="mono">${esc(R.formatAmount(t.amount))} ${esc(t.stablecoin || "")}</span>`) : ""}
        ${field("Merchant", m ? esc(m.name) : '<span class="mini__muted">None identified</span>')}
        ${field("Provider", p ? esc(p.name) : '<span class="mini__muted">None identified</span>')}
        ${t.wallet ? field("Wallet", addr(t.wallet, "wallet address")) : ""}
        ${t.programs ? field("Programs", `<span class="trunc">${esc(t.programs.join(", "))}</span>`) : ""}
        ${field("Signature", addr(t.signature, "transaction signature", source === "api" ? R.explorerLink(cfg, "tx", t.signature) : ""))}
        ${time ? field("Timestamp", `<span class="mono">${esc(time)}</span>`) : ""}
      </dl>
      ${t.evidence && t.evidence.length ? `<ul class="result__evidence" aria-label="Evidence">${t.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}`;
  }

  let analyzeRun = 0;
  async function analyze(signature, scroll) {
    const box = $("[data-result]");
    const input = $("#signature-input");
    if (!box) return;
    signature = String(signature || "").trim();
    input.value = signature;
    $$("[data-samples] .hint").forEach((b) => b.setAttribute("aria-pressed", b.dataset.sig === signature ? "true" : "false"));
    if (scroll) $("#analyzer").scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    if (!signature) { R.toast("Enter a transaction signature"); input.focus(); return; }

    const run = ++analyzeRun;
    box.classList.remove("is-new");
    box.innerHTML = `<div class="scanline" aria-hidden="true"></div><div class="scanning"><p class="result__kicker">Analyzing</p><p class="scanning__sig">${esc(R.truncate(signature, 12, 8))}</p><ol>${SCAN_STEPS.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>`;
    const lis = $$(".scanning li", box);
    const wait = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));
    const lookup = data.transaction(signature);
    for (let i = 0; i < lis.length; i++) { lis[i].classList.add("on"); await wait(260); if (run !== analyzeRun) return; }
    const { record, source } = await lookup;
    if (run !== analyzeRun) return;

    let t = record;
    if (!t) {
      const valid = R.isSignature(signature);
      t = {
        signature, verdict: "UNKNOWN", classification: "UNKNOWN", confidence: "LOW", verification: null, miss: true,
        evidence: valid ? ["Not in the demo dataset", data.live ? "The Rinder API returned no record" : "Live analysis arrives with the Rinder API"] : ["This is not a Solana transaction signature", "Signatures are 86 to 88 base58 characters"],
      };
    }
    box.innerHTML = renderResult(t, source);
    void box.offsetWidth;
    box.classList.add("is-new");
  }

  function analyzer() {
    const form = $("[data-analyze]");
    if (!form) return;
    const samples = $("[data-samples]");
    samples.innerHTML = transactions.map((t) => `<button type="button" class="hint" aria-pressed="false" data-sig="${esc(t.signature)}">${esc(t.label)}</button>`).join("");
    samples.addEventListener("click", (e) => { const b = e.target.closest("[data-sig]"); if (b) analyze(b.dataset.sig); });
    form.addEventListener("submit", (e) => { e.preventDefault(); analyze($("#signature-input").value); });
    // Show a real result on first view instead of an empty card
    new IntersectionObserver(([e], io) => { if (!e.isIntersecting) return; io.disconnect(); if (!$("#signature-input").value && transactions[0]) analyze(transactions[0].signature); }, { threshold: 0.35 }).observe($("[data-result]"));
    const tw = $("[data-typewriter]");
    if (tw) M.typewriter(tw, ["exchange deposits from checkout", "treasury moves from purchases", "a real payment from a transfer"]);
  }

  /* ---------------- Intelligence cards and explorer ---------------- */

  let view = "merchant", selected = { merchant: merchants[0]?.id, stablecoin: coins[0]?.symbol, provider: providers[0]?.id };

  function cardUis() {
    const m = merchants[0], p = providers[0];
    const set = (k, html) => { const el = $(`[data-card-ui="${k}"]`); if (el) el.innerHTML = html; };
    set("merchant", `<span class="mini glass-light"><span class="mini__row"><span class="mini__name">${esc(m.name)}</span>${R.vBadge(m.verification).replace(/Verified</, "<")}</span><span class="mini__row"><span class="mini__muted">Accepts</span><span>${esc(m.stablecoins.join(" · "))}</span></span><span class="mini__row"><span class="mini__muted">Provider</span><span>${esc(providerById(m.provider)?.name || "Direct")}</span></span><span class="mini__row"><span class="mini__muted">Region</span><span>${esc(m.region)}</span></span></span>`);
    const max = Math.max(...coins.map((c) => demo.stablecoinStats?.[c.symbol]?.merchants || 0));
    set("stablecoin", `<span class="mini glass-light">${coins.map((c) => { const v = (demo.stablecoinStats?.[c.symbol]?.merchants || 0) / max; return `<span class="mini__row"><span class="mini__name" style="width:52px">${esc(c.symbol)}</span><span class="mini__bar"><i style="--v:${v.toFixed(3)}"></i></span></span>`; }).join("")}<span class="mini__row"><span class="mini__muted">Known merchants</span><span class="mini__muted">demo</span></span></span>`);
    const pts = [[20, 20], [60, 12], [110, 18], [30, 66], [80, 74], [118, 60]];
    set("provider", `<span class="mini glass-light"><svg class="mini__graph" viewBox="0 0 140 86" aria-hidden="true">${pts.map(([x, y]) => `<line x1="70" y1="43" x2="${x}" y2="${y}"/>`).join("")}${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4"/>`).join("")}<circle class="hub" cx="70" cy="43" r="7"/>${still ? "" : pts.slice(0, 3).map(([x, y], i) => `<circle class="dot" r="2"><animateMotion dur="${2 + i * 0.6}s" repeatCount="indefinite" path="M${x} ${y} L70 43"/></circle>`).join("")}</svg><span class="mini__row"><span class="mini__name">${esc(p.name)}</span><span class="mini__muted">${R.formatNumber(p.merchants)} merchants</span></span></span>`);
  }

  function profileMerchant(m) {
    const p = providerById(m.provider);
    const events = (demo.changes || []).filter((c) => c.entity === m.id).slice(0, 3);
    return `
      <div class="profile__top"><div><p class="profile__kind">Merchant · ${esc(m.category)}</p><h3 class="profile__name">${esc(m.name)}</h3></div>${R.vBadge(m.verification)}</div>
      <dl class="profile__grid">
        ${field("Status", m.status === "ACTIVE" ? "Active" : '<span class="mini__muted">Inactive</span>')}
        ${field("Stablecoins", `<span class="chips">${m.stablecoins.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</span>`)}
        ${field("Payment endpoint", addr(m.endpoint, "payment endpoint"))}
        ${field("Payment provider", p ? esc(p.name) : "Direct to merchant wallet")}
        ${field("Settlement asset", esc(m.settlement))}
        ${field("Region", esc(m.region))}
        ${field("Verification", R.vBadge(m.verification))}
        ${field("Last verified", `<span class="mono">${esc(R.formatDate(m.lastVerified))}</span>`)}
      </dl>
      <div class="profile__sub"><span class="label">Recent changes</span>${events.length ? `<ul class="minievents">${events.map((e) => `<li><span>${esc(R.formatDate(e.date))}</span><span>${esc(e.title)}</span></li>`).join("")}</ul>` : '<p class="mini__muted">No changes recorded.</p>'}</div>`;
  }

  function profileStablecoin(c) {
    const s = demo.stablecoinStats?.[c.symbol] || {};
    const dist = (rows) => `<div class="dist">${(rows || []).map(([k, v]) => `<div class="dist__row"><span>${esc(k)}</span><span class="mini__bar"><i style="--v:${(v / 100).toFixed(2)}"></i></span><span>${v}%</span></div>`).join("")}</div>`;
    const change = s.change90d || 0;
    const ps = providers.filter((p) => p.stablecoins.includes(c.symbol)).map((p) => p.name);
    return `
      <div class="profile__top"><div><p class="profile__kind">Stablecoin · ${esc(c.issuer)}</p><h3 class="profile__name">${esc(c.symbol)} <span class="mini__muted" style="font-size:.55em">${esc(c.name)}</span></h3></div>${R.vBadge(s.verification)}</div>
      <dl class="profile__grid">
        ${field("Mint address", c.mint ? addr(c.mint, `${c.symbol} mint address`, R.explorerLink(cfg, "address", c.mint)) : '<span class="mini__muted">Not configured</span>')}
        ${field("Token program", esc(c.tokenProgram))}
        ${field("Known merchants", `<span class="mono">${R.formatNumber(s.merchants || 0)}</span>`)}
        ${field("Payment endpoints", `<span class="mono">${R.formatNumber(s.endpoints || 0)}</span>`)}
        ${field("Providers", `<span class="mono">${R.formatNumber(s.providers || 0)}</span> <span class="mini__muted trunc">${esc(ps.join(", "))}</span>`)}
        ${field("Observed payments", `<span class="mono">${R.formatNumber(s.observed || 0)}</span> <span class="mini__muted">30d</span>`)}
        ${field("Adoption, 90d", `<span class="delta ${change >= 0 ? "delta--up" : "delta--down"}">${change >= 0 ? "Up" : "Down"} ${Math.abs(change)}%</span>`)}
        ${field("Verification", R.vBadge(s.verification))}
      </dl>
      <div class="profile__grid" style="margin-top:8px">
        <div class="profile__sub"><span class="label">Merchant categories</span>${dist(s.categories)}</div>
        <div class="profile__sub"><span class="label">Regions</span>${dist(s.regions)}</div>
      </div>`;
  }

  function profileProvider(p) {
    const known = merchants.filter((m) => m.provider === p.id).map((m) => m.name);
    return `
      <div class="profile__top"><div><p class="profile__kind">Payment provider</p><h3 class="profile__name">${esc(p.name)}</h3></div>${R.vBadge(p.verification)}</div>
      <dl class="profile__grid">
        ${field("Supported merchants", `<span class="mono">${R.formatNumber(p.merchants)}</span> <span class="mini__muted trunc">${esc(known.join(", "))}</span>`)}
        ${field("Stablecoins", `<span class="chips">${p.stablecoins.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</span>`)}
        ${field("Settlement", esc(p.settlement.join(", ")))}
        ${field("Regions", esc(p.regions.join(", ")))}
        ${field("Observed addresses", `<span class="mono">${p.addresses}</span>`)}
        ${field("Settlement address", addr(p.address, "settlement address"))}
        ${field("First observed", `<span class="mono">${esc(R.formatDate(p.firstObserved))}</span>`)}
        ${field("Last observed", `<span class="mono">${esc(R.formatDate(p.lastObserved))}</span>`)}
      </dl>
      <div class="profile__sub"><span class="label">Program integrations</span><span class="chips">${p.programs.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</span></div>`;
  }

  function renderExplorer(animate) {
    const list = $("[data-explorer-list]"), prof = $("[data-explorer-profile]");
    if (!list) return;
    const entries = view === "merchant" ? merchants.map((m) => [m.id, m.name, m.verification])
      : view === "stablecoin" ? coins.map((c) => [c.symbol, `${c.symbol} · ${c.name}`, demo.stablecoinStats?.[c.symbol]?.verification])
      : providers.map((p) => [p.id, p.name, p.verification]);
    list.innerHTML = entries.map(([id, name, v]) => `<button type="button" class="ent" role="option" aria-selected="${id === selected[view]}" data-id="${esc(id)}"><span>${esc(name)}</span>${R.vBadge(v)}</button>`).join("");
    const id = selected[view];
    prof.innerHTML = `<div class="profile">${view === "merchant" ? profileMerchant(merchantById(id)) : view === "stablecoin" ? profileStablecoin(coinBySymbol(id)) : profileProvider(providerById(id))}</div>`;
    if (animate && !still) prof.firstElementChild.classList.add("is-new");
    $$(".card").forEach((c) => c.setAttribute("aria-selected", c.dataset.view === view ? "true" : "false"));
  }

  function openProfile(kind, id) {
    view = kind;
    selected[kind] = id;
    renderExplorer(true);
    const ex = $("#explorer");
    ex.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    ex.focus({ preventScroll: true });
  }

  function intelligence() {
    cardUis();
    $$(".card").forEach((c) => c.addEventListener("click", () => { view = c.dataset.view; renderExplorer(true); }));
    $("[data-explorer-list]").addEventListener("click", (e) => { const b = e.target.closest(".ent"); if (b) { selected[view] = b.dataset.id; renderExplorer(true); } });
    renderExplorer(false);
  }

  /* ---------------- Solana intelligence ---------------- */

  function mapSvg() {
    const t = transactions[0];
    const coin = coinBySymbol(t.stablecoin);
    const p = providerById(t.provider), m = merchantById(t.merchant);
    const N = [
      { x: 20, y: 36, k: "WALLET", v: "Customer" },
      { x: 20, y: 170, k: "TOKEN ACCOUNT", v: `Source ${t.stablecoin}` },
      { x: 210, y: 100, k: "PROGRAM", v: "SPL Token", hl: true },
      { x: 400, y: 170, k: "TOKEN ACCOUNT", v: `Dest ${t.stablecoin}` },
      { x: 400, y: 36, k: "OWNER", v: `${p.name}` },
      { x: 210, y: 16, k: "MINT", v: coin ? R.truncate(coin.mint, 5, 4) : t.stablecoin },
      { x: 400, y: 290, k: "MERCHANT", v: m.name, hl: true },
      { x: 110, y: 290, k: "CLASSIFIED", v: "Payment gateway", out: true },
    ];
    const W = 140, H = 50;
    const c = (i, s) => { const n = N[i]; return s === "r" ? [n.x + W, n.y + H / 2] : s === "l" ? [n.x, n.y + H / 2] : s === "t" ? [n.x + W / 2, n.y] : [n.x + W / 2, n.y + H]; };
    const E = [[0, "b", 1, "t", false], [1, "r", 2, "l", true], [2, "r", 3, "l", true], [3, "t", 4, "b", false], [5, "b", 2, "t", false], [4, "b", 6, "t", false], [6, "l", 7, "r", true], [3, "b", 6, "t", false]];
    let svg = "";
    for (let x = 0; x <= 560; x += 20) svg += `<line class="grid" x1="${x}" y1="0" x2="${x}" y2="380"/>`;
    for (let y = 0; y <= 380; y += 20) svg += `<line class="grid" x1="0" y1="${y}" x2="560" y2="${y}"/>`;
    E.forEach(([a, sa, b, sb, flow], i) => {
      const [x1, y1] = c(a, sa), [x2, y2] = c(b, sb);
      const d = sa === "r" || sa === "l" ? `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}` : `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
      svg += `<path id="me${i}" class="e${flow ? " flow" : ""}" d="${d}"/>`;
    });
    N.forEach((n) => (svg += `<g class="n${n.hl ? " hl" : ""}${n.out ? " out" : ""}"><rect x="${n.x}" y="${n.y}" width="${W}" height="${H}" rx="8"/><text class="k" x="${n.x + 12}" y="${n.y + 19}">${esc(n.k)}</text><text class="v" x="${n.x + 12}" y="${n.y + 36}">${esc(n.v)}</text></g>`));
    if (!still) [1, 2, 6].forEach((e, i) => (svg += `<rect class="p" width="4" height="4" x="-2" y="-2"><animateMotion dur="${1.8 + i * 0.3}s" begin="${i * 0.6}s" repeatCount="indefinite"><mpath href="#me${e}"/></animateMotion></rect>`));
    return svg;
  }

  function solana() {
    const stats = $("[data-solana-stats]");
    if (!stats) return;
    stats.innerHTML = (demo.solana?.stats || []).map((s) => `<div><dt>${esc(s.label)}</dt><dd data-count="${s.value}">${s.suffix ? `<small>${esc(s.suffix)}</small>` : ""}</dd></div>`).join("");
    $$("[data-count]", stats).forEach((el) => M.countUp(el, Number(el.dataset.count)));
    $("[data-map]").innerHTML = mapSvg();

    const programs = $("[data-programs]");
    programs.innerHTML = (demo.solana?.programs || []).map((p) => `<li data-program="${esc(p.name)}"><span>${esc(p.name)}</span><span class="mini__bar"><i style="--v:0"></i></span><span>${p.share}%</span></li>`).join("");
    const bars = $$(".mini__bar i", programs);
    new IntersectionObserver(([e], io) => { if (!e.isIntersecting) return; io.disconnect(); bars.forEach((b, i) => (b.style.setProperty("--v", (demo.solana.programs[i].share / 100).toFixed(2)))); }, { threshold: 0.3 }).observe(programs);

    // Observed activity: demo transfers cycling in, newest on top
    const feed = $("[data-feed]");
    const row = (t) => `<li class="feed__row on-dark"><span class="mono trunc" title="${esc(t.signature)}">${esc(R.truncate(t.signature, 10, 4))}</span><span class="col-coin">${esc(t.stablecoin)}</span><span class="amt mono">${esc(R.formatAmount(t.amount))}</span><span>${R.clsBadge(t.classification)}</span><span class="col-conf">${R.cBadge(t.confidence)}</span></li>`;
    let n = 0;
    feed.innerHTML = transactions.slice(0, 5).map(row).join("");
    if (still) return;
    let visible = false;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(feed);
    setInterval(() => {
      if (!visible || document.hidden) return;
      n = (n + 1) % transactions.length;
      feed.insertAdjacentHTML("afterbegin", row(transactions[(n + 4) % transactions.length]));
      while (feed.children.length > 5) feed.lastElementChild.remove();
    }, 2600);
  }

  function focusProgram(name) {
    $("#solana").scrollIntoView({ behavior: still ? "auto" : "smooth" });
    const li = $$("[data-program]").find((l) => l.dataset.program === name);
    if (li) { li.style.transition = "background-color .6s"; li.style.backgroundColor = "rgba(160,215,209,.12)"; setTimeout(() => (li.style.backgroundColor = ""), 1800); }
    else R.toast(`${name}: see program interactions`);
  }

  /* ---------------- Verification ---------------- */

  function verification() {
    const seal = $("[data-seal]"), label = $("[data-seal-label]"), list = $("[data-states]");
    if (!seal) return;
    const keys = Object.keys(R.VERIFICATION);
    const colors = { VERIFIED: "var(--v-verified)", PARTIALLY_VERIFIED: "var(--v-partial)", STALE: "var(--v-stale)", UNVERIFIED: "var(--v-unverified)" };
    const r = 92, C = 2 * Math.PI * r;
    let ticks = "";
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; const r1 = i % 5 ? 108 : 104; ticks += `<line class="tick" x1="${120 + Math.cos(a) * r1}" y1="${120 + Math.sin(a) * r1}" x2="${120 + Math.cos(a) * 112}" y2="${120 + Math.sin(a) * 112}" stroke-width="1"/>`; }
    seal.innerHTML = `${ticks}<circle class="track" cx="120" cy="120" r="${r}" fill="none" stroke-width="10"/><circle class="arc" cx="120" cy="120" r="${r}" fill="none" stroke-width="10" transform="rotate(-90 120 120)" stroke-dasharray="0 ${C}"/><circle class="sweep" cx="120" cy="120" r="74" fill="none" stroke-width="1" stroke-dasharray="2 6"/><g class="core"><rect x="104" y="104" width="32" height="32"/></g>`;
    const arc = $(".arc", seal), core = $(".core", seal);
    list.innerHTML = keys.map((k) => `<li><button type="button" role="tab" class="state vb--${k}" aria-selected="false" data-state="${k}"><span class="state__glyph">${R.ringSvg(k, 16)}</span><span class="state__name">${esc(R.VERIFICATION[k].label)}</span><span class="state__desc">${esc(R.VERIFICATION[k].desc)}</span></button></li>`).join("");

    let current = 0, hold = 0;
    const set = (i) => {
      current = i;
      const k = keys[i], v = R.VERIFICATION[k];
      seal.style.setProperty("--sc", colors[k]);
      label.style.setProperty("--sc", colors[k]);
      label.textContent = v.label;
      seal.setAttribute("aria-label", `Verification state: ${v.label}`);
      arc.setAttribute("stroke-dasharray", k === "STALE" ? "14 10" : k === "UNVERIFIED" ? "2 12" : `${v.fill * C} ${C}`);
      arc.style.opacity = k === "UNVERIFIED" ? "0.8" : k === "STALE" ? "0.75" : "1";
      core.style.opacity = k === "VERIFIED" ? "1" : k === "PARTIALLY_VERIFIED" ? "0.45" : "0";
      core.style.transform = k === "VERIFIED" ? "scale(1)" : "scale(0.6)";
      $$(".state", list).forEach((b, n) => b.setAttribute("aria-selected", n === i ? "true" : "false"));
    };
    list.addEventListener("click", (e) => { const b = e.target.closest("[data-state]"); if (b) { hold = Date.now() + 9000; set(keys.indexOf(b.dataset.state)); } });
    let visible = false;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.4 }).observe(seal);
    set(0);
    if (!still) setInterval(() => { if (visible && Date.now() > hold) set((current + 1) % keys.length); }, 3400);
  }

  /* ---------------- Change intelligence ---------------- */

  const CHANGE_ICON = { STABLECOIN_ADDED: "plus", STABLECOIN_REMOVED: "minus", PROVIDER_CHANGED: "route", ENDPOINT_CHANGED: "endpoint", VERIFICATION_STALE: "clock", VERIFICATION_RENEWED: "shield", ACCEPTANCE_INACTIVE: "minus", MINT_SUPPORT_CHANGED: "coin" };

  function changes() {
    const list = $("[data-timeline]");
    if (!list) return;
    const name = (id) => merchantById(id)?.name || providerById(id)?.name || id;
    const render = (filter) => {
      const events = (demo.changes || []).filter((c) => filter === "all" || c.group === filter);
      list.innerHTML = events.length ? events.map((c, i) => `<li class="event" style="transition-delay:${still ? 0 : i * 70}ms"><span class="event__date">${esc(R.formatDate(c.date))}</span><span class="event__dot" aria-hidden="true"><i></i></span><div class="event__card"><span class="event__icon">${pixel(CHANGE_ICON[c.type] || "scan")}</span><div class="event__main"><p class="event__type">${esc(c.type.replace(/_/g, " "))}</p><p class="event__title">${esc(c.title)}</p><p class="event__detail">${esc(c.detail)}</p></div><span class="event__entity">${esc(name(c.entity))}</span></div></li>`).join("") : `<li class="timeline__empty">No events for this filter.</li>`;
      const els = $$(".event", list);
      if (still) return els.forEach((e) => e.classList.add("is-in"));
      if (list.dataset.seen) requestAnimationFrame(() => els.forEach((e) => e.classList.add("is-in")));
    };
    new IntersectionObserver(([e], io) => { if (!e.isIntersecting) return; io.disconnect(); list.dataset.seen = "1"; $$(".event", list).forEach((el) => el.classList.add("is-in")); }, { threshold: 0.15 }).observe(list);
    const filters = $("[data-change-filters]");
    filters.addEventListener("click", (e) => {
      const b = e.target.closest("[data-filter]");
      if (!b) return;
      $$("[data-filter]", filters).forEach((f) => f.setAttribute("aria-pressed", f === b ? "true" : "false"));
      render(b.dataset.filter);
    });
    render("all");
  }

  /* ---------------- API and configuration status ---------------- */

  function apiStatus() {
    const dl = $("[data-status]");
    if (dl) {
      const row = (k, v, ok) => `<div><dt>${esc(k)}</dt><dd><span class="dotstate${ok ? " ok" : ""}" aria-hidden="true"></span>${v}</dd></div>`;
      const host = (u) => { try { return new URL(u).host; } catch { return u; } };
      const prog = (label, id) => row(label, id ? addr(id, `${label} program ID`, R.explorerLink(cfg, "address", id)) : '<span class="mini__muted">Not deployed</span>', Boolean(id));
      dl.innerHTML = [
        row("Cluster", esc(`Solana ${cfg.clusterLabel}`), true),
        row("API", cfg.apiBaseUrl ? `<span class="mono trunc">${esc(host(cfg.apiBaseUrl))}</span>` : '<span class="mini__muted">Coming soon. Demo data in use.</span>', Boolean(cfg.apiBaseUrl)),
        ...Object.entries(cfg.programs).map(([k, v]) => prog(`${k.charAt(0).toUpperCase()}${k.slice(1)} program`, v)),
        row("Token mint", cfg.token.mint ? addr(cfg.token.mint, "token mint") : '<span class="mini__muted">Coming soon</span>', Boolean(cfg.token.mint)),
      ].join("");
    }
    const pre = $("[data-code]");
    if (pre) {
      const t = transactions[0];
      const coin = coinBySymbol(t.stablecoin);
      const body = {
        signature: t.signature,
        verdict: t.verdict,
        classification: t.classification,
        confidence: t.confidence,
        stablecoin: { symbol: t.stablecoin, mint: coin ? coin.mint : "" },
        amount: t.amount,
        merchant: merchantById(t.merchant)?.name,
        provider: providerById(t.provider)?.name,
        verification: { status: t.verification.toLowerCase(), last_checked: merchantById(t.merchant)?.lastVerified },
        programs: t.programs,
      };
      const json = JSON.stringify(body, null, 2)
        .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
        .replace(/("[^"]+")(:)/g, '<span class="k">$1</span>$2')
        .replace(/: ("[^"]*")/g, ': <span class="s">$1</span>')
        .replace(/: (\d[\d.]*)/g, ': <span class="n">$1</span>')
        .replace(/^(\s+)("[^"]*")(,?)$/gm, '$1<span class="s">$2</span>$3');
      pre.innerHTML = `<span class="c">// GET /v1/transactions/{signature}</span>\n${json}`;
    }
  }

  /* ---------------- Footer and menu ---------------- */

  function footer() {
    const box = $("[data-social]");
    if (!box) return;
    const links = [["x", "X", "x"], ["github", "GitHub", "github"], ["docs", "Docs", "doc"]].filter(([k]) => cfg.links[k]);
    if (!links.length) return box.remove();
    box.innerHTML = links.map(([k, label, icon]) => `<a class="social" href="${esc(cfg.links[k])}" target="_blank" rel="noopener noreferrer" aria-label="Open Rinder on ${label}">${pixel(icon)}</a>`).join("");
  }

  function menu() {
    const btn = $("[data-menu-toggle]"), panel = $("[data-menu]");
    if (!btn) return;
    const set = (open) => {
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      panel.hidden = !open;
      document.body.style.overflow = open ? "hidden" : "";
    };
    btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
    panel.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { set(false); btn.focus(); } });
    matchMedia("(min-width: 1024px)").addEventListener("change", (e) => e.matches && set(false));
  }

  document.addEventListener("DOMContentLoaded", () => {
    decorate();
    copyHandler();
    tokenCA();
    search();
    metrics();
    classification();
    analyzer();
    intelligence();
    solana();
    verification();
    changes();
    apiStatus();
    footer();
    menu();
  });

  // Exposed for tests and the console. Not part of the UI.
  window.RinderApp = { searchIndex, buildIndex, analyze, openProfile };
})();
