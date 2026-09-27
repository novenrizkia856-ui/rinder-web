/**
 * Hero visual: the Rinder lens, in the same pixel style as the other scenes.
 *
 * Stablecoin transfers drift in from the left, all the same neutral light.
 * They pass through the lens core and leave to the right, sorted into the
 * seven classifications, each in its own colour. On wide screens they land
 * on a column of labels that light up as they arrive.
 *
 * Like pixel.js it draws into a low resolution canvas with the shared palette
 * and 4x4 Bayer dithering, scaled up with crisp pixels. The static layers
 * (sky, lens, dial, core with the mark, floor and its reflection) render once
 * per resize into a base buffer; each frame copies the base and draws the
 * sweep, the particles and the core pulse. Animation stops offscreen, in
 * hidden tabs and for reduced motion, which gets a single still frame.
 */
(function () {
  "use strict";

  const root = document.querySelector("[data-hero-art]");
  const P = window.RinderPixel;
  if (!root || !P) return;
  const Rn = window.Rinder;
  const still = Rn && Rn.reducedMotion();
  const canvas = root.querySelector("[data-hero-canvas]");
  const tagBox = root.querySelector("[data-hero-tags]");
  const ctx = canvas.getContext("2d", { alpha: false });
  const hero = root.parentElement;
  const { bayer, dither, ramp, PAL } = P;

  // Top to bottom on the right. The weight is how often a transfer lands there.
  // Each ramp runs dark to bright; rgb is the label colour.
  const OUT = [
    { key: "DIRECT_PAYMENT", rgb: [192, 255, 1], w: 0.19, ramp: ["#1c2a06", "#3f5e06", "#78a603", "#a8e000", "#c0ff01", "#e6ff99"] },
    { key: "PAYMENT_GATEWAY", rgb: [218, 255, 120], w: 0.21, ramp: ["#242f10", "#4d651c", "#86b033", "#bde66b", "#daff78", "#f2ffc9"] },
    { key: "DEFI", rgb: [111, 227, 210], w: 0.16, ramp: ["#123633", "#1f5f58", "#3c9c8f", "#6fe3d2", "#9ff0e3", "#dcfaf5"] },
    { key: "EXCHANGE", rgb: [80, 172, 222], w: 0.14, ramp: ["#0a2638", "#0a4f75", "#1f7fb5", "#50acde", "#8ccbee", "#d3ecf9"] },
    { key: "TREASURY", rgb: [226, 190, 122], w: 0.1, ramp: ["#2e2615", "#5a4a2a", "#937a4f", "#e2be7a", "#efd29c", "#faf0dc"] },
    { key: "INTERNAL_TRANSFER", rgb: [168, 186, 240], w: 0.11, ramp: ["#1d2238", "#373f6a", "#5e6cab", "#a8baf0", "#c7d3f6", "#eef2fd"] },
    { key: "UNKNOWN", rgb: [150, 158, 154], w: 0.09, ramp: ["#232826", "#3d4442", "#626a67", "#969e9a", "#b5bbb8", "#e3e6e4"] },
  ].map((o) => ({ ...o, px: ramp(o.ramp) }));
  const NEUTRAL = ramp(["#1f2b2b", "#3a4d4d", "#728383", "#a5afaf", "#cfd3cf", "#fefffc"]);
  const LIME = OUT[0].px;
  const CORE = ramp(["#050a0a", "#081010", "#0b1616", "#0f1d1d", "#142626"]);
  const IN_LANES = 6;
  const STEP = 3; // lane resolution in CSS px
  const FPS = 30;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Seeded random, so the sky is the same on every visit.
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- Lanes, in CSS px ---------------- */

  function bezier(p0, p1, p2, p3, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, m = 1 - t;
      const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
      pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
    }
    return pts;
  }

  // Resample a polyline to points STEP px apart, so distance maps to an index.
  function resample(pts) {
    const out = [pts[0][0], pts[0][1]];
    let need = STEP;
    for (let i = 1; i < pts.length; i++) {
      let ax = pts[i - 1][0], ay = pts[i - 1][1];
      const bx = pts[i][0], by = pts[i][1];
      let seg = Math.hypot(bx - ax, by - ay);
      while (seg >= need) {
        const k = need / seg;
        ax += (bx - ax) * k; ay += (by - ay) * k;
        out.push(ax, ay);
        seg -= need; need = STEP;
      }
      need -= seg;
    }
    const lane = new Float32Array(out);
    return { pts: lane, len: (lane.length / 2 - 1) * STEP };
  }

  function at(lane, d, o) {
    const n = lane.pts.length / 2 - 1;
    const f = clamp(d / STEP, 0, n);
    const i = Math.min(n - 1, Math.floor(f)), k = f - i, p = lane.pts;
    o[0] = p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * k;
    o[1] = p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * k;
    return o;
  }

  /* ---------------- State ---------------- */

  let W = 0, H = 0, GW = 0, GH = 0, sx = 1, sy = 1, L = null;
  let base = null, buf = null, image = null;
  let lanesIn = [], lanesOut = [], parts = [], stars = [], tags = [], rim = [];
  let pulse = 0, spawnDebt = 0, visible = true, raf = 0, last = 0, lastSize = "";
  const mark = new Image();
  mark.src = "assets/img/mark-lime.png";
  const pos = [0, 0], tmp = [0, 0];

  function layout(tagW) {
    const vh = Math.min(window.innerHeight || H, H);
    const wide = W >= 1024;
    const title = hero.querySelector(".hero__title");
    const card = hero.querySelector(".hero__card");
    const top = title ? title.offsetTop + title.offsetHeight + (wide ? 24 : 16) : 180;
    const cardTop = card ? vh - (wide ? 24 : 16) - card.offsetHeight : vh * 0.6;
    const L = { wide, tags: W >= 1200 };
    if (wide) {
      // Fit the lens between the card on the left and the label column on the right.
      const avail = Math.max(320, vh - top - 36);
      const left = card ? card.offsetLeft + card.offsetWidth + 24 : W * 0.35;
      L.colX = L.tags ? W - 40 - tagW : W + 20;
      L.r = clamp(Math.min(W * 0.155, avail * 0.4, (L.colX - left) / 3.05), 140, 330);
      L.cy = top + avail * 0.5;
      const lo = left + L.r * 1.15, hi = L.colX - L.r * 1.95;
      L.cx = lo > hi ? (lo + hi) / 2 : clamp(W * 0.56, lo, hi);
      L.gap = clamp(avail * 0.09, 42, 62);
    } else {
      const avail = Math.max(200, cardTop - top - 12);
      L.r = clamp(Math.min(W * 0.27, avail * 0.42), 70, 220);
      L.cy = top + avail * 0.48;
      L.cx = W * 0.5;
    }
    L.rc = Math.max(30, L.r * 0.25);
    L.horizon = L.cy + L.r * 1.05;
    return L;
  }

  function buildLanes() {
    const { cx, cy, r, rc, wide } = L;
    lanesIn = [];
    for (let k = 0; k < IN_LANES; k++) {
      const u = k / (IN_LANES - 1);
      const y0 = wide ? cy + (u - 0.7) * 1.95 * r : cy + (u - 0.5) * 2.3 * r;
      const x0 = -40;
      const end = [cx - rc - 4, cy + (u - 0.5) * rc * 0.5];
      lanesIn.push(resample(bezier([x0, y0], [x0 + (cx - x0) * 0.46, y0], [end[0] - r * 0.62, cy + (y0 - cy) * 0.12], end, 90)));
    }
    lanesOut = OUT.map((c, j) => {
      const y1 = L.tags ? cy + (j - (OUT.length - 1) / 2) * L.gap : cy + (j / (OUT.length - 1) - 0.5) * 2.5 * r;
      const x1 = L.tags ? L.colX - 8 : W + 40;
      const start = [cx + rc + 4, cy + (j / (OUT.length - 1) - 0.5) * rc * 0.5];
      const lane = resample(bezier(start, [start[0] + r * 0.62, cy + (y1 - cy) * 0.18], [x1 - (x1 - cx) * 0.42, y1], [x1, y1], 90));
      lane.y1 = y1;
      return lane;
    });
  }

  function pick() {
    let v = Math.random();
    for (let j = 0; j < OUT.length; j++) { v -= OUT[j].w; if (v <= 0) return j; }
    return OUT.length - 1;
  }

  function spawn() {
    const out = pick();
    parts.push({
      a: (Math.random() * IN_LANES) | 0, b: out, d: 0,
      v: (L.wide ? 150 : 90) * (0.8 + Math.random() * 0.5),
      tail: (L.wide ? 46 : 30) * (0.7 + Math.random() * 0.7),
      crossed: false,
    });
  }

  // Distance along the joined path: in lane, a hidden hop behind the core, out lane.
  function hop() { return L.rc * 2 + 8; }
  function place(p, d, o) {
    const A = lanesIn[p.a], B = lanesOut[p.b];
    if (d <= A.len) return at(A, d, o);
    const h = hop();
    if (d < A.len + h) {
      at(A, A.len, o); at(B, 0, tmp);
      const k = (d - A.len) / h;
      o[0] += (tmp[0] - o[0]) * k; o[1] += (tmp[1] - o[1]) * k;
      return o;
    }
    return at(B, d - A.len - h, o);
  }
  const total = (p) => lanesIn[p.a].len + hop() + lanesOut[p.b].len;

  /* ---------------- Pixels ---------------- */

  const put = (b, x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < GW && y < GH) b[y * GW + x] = c; };

  // The mark, sampled down to the pixel grid, lit along its upper left edges.
  function markPixels(h) {
    if (!mark.complete || !mark.naturalWidth) return [];
    const w = Math.max(1, Math.round((h * mark.naturalWidth) / mark.naturalHeight));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(mark, 0, 0, w, h);
    const a = g.getImageData(0, 0, w, h).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 110;
    const out = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!on(x, y)) continue;
        const lit = !on(x - 1, y - 1) || !on(x, y - 1);
        const shade = !on(x + 1, y + 1);
        out.push(x - w / 2, y - h / 2, lit ? 5 : shade ? 3 : 4);
      }
    }
    return out;
  }

  function paintBase() {
    const b = new Uint32Array(GW * GH);
    const { nightSky, ground, grid, gridHi, star } = PAL;
    const X = L.cx * sx, Y = L.cy * sy, R = L.r * sx, RC = L.rc * sx;
    const HZ = Math.min(GH - 1, Math.round(L.horizon * sy));

    // Sky: a teal glow behind the lens and along the horizon; darker glass inside the lens
    for (let y = 0; y < HZ; y++) {
      const v = y / HZ;
      for (let x = 0; x < GW; x++) {
        const dx = (x - X) / (R * 2.1), dy = (y - Y) / (R * 1.9);
        const hx = (x - X) / (GW * 0.5), hy = (y - HZ) / (GH * 0.12);
        const d = Math.hypot(x + 0.5 - X, y + 0.5 - Y);
        let t = Math.pow(v, 2.2) * 0.3 + Math.exp(-(dx * dx + dy * dy)) * 0.3 + Math.exp(-(hx * hx + hy * hy)) * 0.3;
        if (d < R) t = t * 0.55 + Math.pow(d / R, 7) * 0.24;
        b[y * GW + x] = dither(nightSky, t, x, y);
      }
    }

    // Ground with perspective ledger lines converging under the lens
    for (let y = HZ; y < GH; y++) {
      const v = (y - HZ) / Math.max(1, GH - HZ);
      for (let x = 0; x < GW; x++) {
        const dx = (x - X) / (GW * 0.5);
        const glow = Math.exp(-(dx * dx) / 0.3) * Math.max(0, 1 - v * 2.2);
        b[y * GW + x] = dither(ground, 0.85 - v * 0.7 + glow * 0.6, x, y);
      }
    }
    const rays = 20;
    for (let i = 0; i <= rays; i++) {
      const bx = (i / rays) * GW * 3 - GW;
      for (let y = HZ + 1; y < GH; y++) {
        const v = (y - HZ) / (GH - HZ);
        const x = Math.round(X + (bx - X) * v);
        if (x >= 0 && x < GW && bayer(x, y) < 0.85) b[y * GW + x] = i === rays / 2 ? gridHi : grid;
      }
    }
    for (let k = 1; k < 14; k++) {
      const y = Math.round(HZ + Math.pow(k / 14, 2.1) * (GH - HZ));
      for (let x = 0; x < GW; x++) if (y < GH && bayer(x, y) < 0.55) b[y * GW + x] = grid;
    }

    // The lens and its core mirrored in the floor, fading with depth
    const deep = R * 1.3;
    for (let y = HZ + 1; y < Math.min(GH, HZ + deep); y++) {
      const fade = 1 - (y - HZ) / deep;
      const my = 2 * HZ - y + 0.5;
      for (let x = Math.max(0, Math.floor(X - R - 2)); x < Math.min(GW, X + R + 2); x++) {
        const d = Math.hypot(x + 0.5 - X, my - Y);
        if (Math.abs(d - R) < 0.9 && bayer(x, y) < 0.6 * fade) b[y * GW + x] = dither(nightSky, 0.42 + 0.2 * fade, x, y);
        else if (Math.abs(d - RC) < 0.8 && bayer(x, y) < 0.7 * fade) b[y * GW + x] = LIME[1];
      }
    }

    // Horizon line, brightest under the lens
    for (let x = 0; x < GW; x++) {
      const k = 1 - Math.abs(x - X) / (GW * 0.55);
      if (bayer(x, HZ) < k) b[HZ * GW + x] = dither(nightSky, 0.55 + 0.35 * k, x, HZ);
    }

    // Stars, thinning towards the horizon
    const rand = rng(11);
    stars = [];
    for (let i = 0, n = Math.round((GW * HZ) / 240); i < n; i++) {
      const x = Math.floor(rand() * GW), y = Math.floor(Math.pow(rand(), 1.5) * HZ * 0.85);
      if (Math.hypot(x - X, y - Y) < R + 6) continue;
      stars.push({ x, y, p: rand() * 6.28, s: 0.4 + rand() * 1.2, b: rand() });
    }

    // Lane guides: sparse dots going in, denser class coloured dots coming out
    const dots = (lane, every, c) => {
      for (let d = 0; d <= lane.len; d += every) { at(lane, d, tmp); put(b, tmp[0] * sx, tmp[1] * sy, c); }
    };
    for (const lane of lanesIn) dots(lane, 3 / sx, NEUTRAL[1]);
    lanesOut.forEach((lane, j) => dots(lane, 2 / sx, OUT[j].px[1]));

    // The ring: lime at the top right, mint elsewhere, dithered between the two, with a sparse glow
    for (let y = Math.max(0, Math.floor(Y - R - 5)); y < Math.min(HZ, Y + R + 5); y++) {
      for (let x = Math.max(0, Math.floor(X - R - 5)); x < Math.min(GW, X + R + 5); x++) {
        const d = Math.hypot(x + 0.5 - X, y + 0.5 - Y), band = Math.abs(d - R);
        const th = Math.atan2(y + 0.5 - Y, x + 0.5 - X);
        const lime = Math.pow(0.5 + 0.5 * Math.cos(th + Math.PI / 4), 2.2);
        const lit = 0.5 - 0.5 * Math.sin(th);
        if (band < 0.85) b[y * GW + x] = bayer(x, y) < lime ? LIME[3 + Math.round(lit * 2)] : dither(nightSky, 0.72 + 0.28 * lit, x, y);
        else if (band < 3.4 && bayer(x, y) < (1 - (band - 0.85) / 2.55) * 0.42) b[y * GW + x] = dither(nightSky, 0.48 + 0.14 * lit, x, y);
      }
    }

    // Dial ticks outside the ring and a dotted circle inside it
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2, len = k % 10 === 0 ? 3 : k % 5 === 0 ? 2 : 1;
      for (let j = 0; j < len; j++) {
        const rad = R * 1.08 + 2 + j;
        put(b, X + Math.cos(a) * rad, Y + Math.sin(a) * rad, k % 10 === 0 ? star[3] : star[1]);
      }
    }
    const inner = R * 0.88, count = Math.round((Math.PI * 2 * inner) / 4);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      put(b, X + Math.cos(a) * inner, Y + Math.sin(a) * inner, nightSky[6]);
    }

    // The core: a dark disc lit from above, a lime rim and the mark
    rim = [];
    for (let y = Math.floor(Y - RC - 3); y < Y + RC + 3; y++) {
      for (let x = Math.floor(X - RC - 3); x < X + RC + 3; x++) {
        const d = Math.hypot(x + 0.5 - X, y + 0.5 - Y);
        if (d < RC - 0.7) put(b, x, y, dither(CORE, 0.95 - ((y - (Y - RC)) / (2 * RC)) * 0.8, x, y));
        else if (d < RC + 0.7) { put(b, x, y, LIME[3]); rim.push(x, y); }
        else if (d < RC + 2.6 && bayer(x, y) < 0.3) put(b, x, y, LIME[1]);
      }
    }
    const mp = markPixels(Math.max(12, Math.round(RC * 1.2)));
    for (let i = 0; i < mp.length; i += 3) put(b, X + mp[i], Y + mp[i + 1], LIME[mp[i + 2]]);

    return b;
  }

  /* ---------------- Labels ---------------- */

  function buildTags() {
    if (!tagBox) return;
    if (!tagBox.childElementCount) {
      const C = (Rn && Rn.CLASSIFICATIONS) || {};
      tagBox.innerHTML = OUT.map((o) => {
        const c = C[o.key] || { label: o.key, glyph: "000010000" };
        const cells = c.glyph.split("").map((b) => `<i${b === "1" ? ' class="on"' : ""}></i>`).join("");
        return `<span class="hero__tag" style="--c:${o.rgb.join(",")}"><span class="hero__glyph">${cells}</span>${c.label}</span>`;
      }).join("");
    }
    tags = [...tagBox.children];
  }
  const tagWidth = () => (tags.length && W >= 1200 ? Math.max(...tags.map((t) => t.offsetWidth)) : 170);

  function placeTags() {
    tags.forEach((el, j) => {
      if (!L.tags) return;
      el.style.left = `${L.colX}px`;
      el.style.top = `${lanesOut[j].y1}px`;
    });
  }

  const hitTimers = new Map();
  function hit(j) {
    const el = tags[j];
    if (!el || !L.tags) return;
    el.classList.add("is-hit");
    clearTimeout(hitTimers.get(j));
    hitTimers.set(j, setTimeout(() => el.classList.remove("is-hit"), 260));
  }

  /* ---------------- Frame ---------------- */

  function drawStars(t) {
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * 0.001 * s.s + s.p);
      const lvl = s.b * 0.6 + tw * 0.4;
      if (lvl > 0.35) buf[s.y * GW + s.x] = PAL.star[Math.min(4, Math.floor(lvl * 5))];
    }
  }

  // A lime sweep runs round the ring, brightest at its head.
  function drawSweep(t) {
    const X = L.cx * sx, Y = L.cy * sy, R = L.r * sx;
    const a = still ? -0.6 : (t * 0.0007) % (Math.PI * 2);
    const span = Math.PI * 2 * 0.13, n = Math.ceil(span * R * 1.6);
    for (let i = 0; i <= n; i++) {
      const f = i / n, th = a + span * f;
      const x = Math.floor(X + Math.cos(th) * R), y = Math.floor(Y + Math.sin(th) * R);
      if (f < 0.35 && bayer(x, y) > f / 0.35) continue;
      put(buf, x, y, LIME[Math.min(5, 1 + Math.round(f * 4.4))]);
    }
  }

  // Each particle is a head pixel and a trail that steps down its ramp and dithers out.
  function drawParticles() {
    const h = hop();
    for (const p of parts) {
      const A = lanesIn[p.a].len;
      const hidden = (d) => d > A - 2 && d < A + h + 2;
      const tail = Math.min(p.tail, p.d);
      const n = Math.max(1, Math.round(tail * sx));
      for (let k = n; k >= 0; k--) {
        const d = p.d - (tail * k) / n;
        if (hidden(d)) continue;
        place(p, d, tmp);
        const x = Math.floor(tmp[0] * sx), y = Math.floor(tmp[1] * sy);
        const f = 1 - k / (n + 1);
        if (k > 0 && bayer(x, y) > f + 0.2) continue;
        const r = d > A + h ? OUT[p.b].px : NEUTRAL;
        put(buf, x, y, k === 0 ? r[5] : r[Math.max(1, Math.round(4 * f))]);
      }
      if (hidden(p.d) || p.d <= A + h) continue;
      // sorted transfers get a small cross of light around the head
      place(p, p.d, pos);
      const x = Math.floor(pos[0] * sx), y = Math.floor(pos[1] * sy), c = OUT[p.b].px[2];
      put(buf, x - 1, y, c); put(buf, x + 1, y, c); put(buf, x, y - 1, c); put(buf, x, y + 1, c);
    }
  }

  // Each transfer that crosses the core makes its rim flare.
  function drawPulse() {
    if (pulse < 0.12) return;
    const c = LIME[Math.min(5, 3 + Math.round(pulse * 2.4))];
    for (let i = 0; i < rim.length; i += 2) put(buf, rim[i], rim[i + 1], c);
  }

  function step(dt) {
    const rate = L.wide ? 9 : 4.5;
    spawnDebt += rate * dt;
    while (spawnDebt >= 1) { spawn(); spawnDebt -= 1; }
    const { cx, cy, r } = L;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      place(p, p.d, pos);
      const near = Math.hypot(pos[0] - cx, pos[1] - cy) / (r * 1.2);
      p.d += p.v * dt * (0.4 + 0.6 * clamp(near, 0, 1));
      if (!p.crossed && p.d > lanesIn[p.a].len + hop() / 2) { p.crossed = true; pulse = Math.min(1, pulse + 0.25); }
      if (p.d >= total(p)) { hit(p.b); parts.splice(i, 1); }
    }
    pulse *= Math.pow(0.08, dt);
  }

  function frame(t) {
    buf.set(base);
    drawStars(t);
    drawSweep(t);
    drawParticles();
    drawPulse();
    ctx.putImageData(image, 0, 0);
  }

  function loop(t) {
    raf = 0;
    if (!visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
    if (last && t - last < 1000 / FPS - 2) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    step(dt);
    frame(t);
  }
  function start() {
    if (still || raf || !visible || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function build() {
    const rect = root.getBoundingClientRect();
    W = rect.width; H = rect.height;
    if (!W || !H) return;
    const key = `${Math.round(W)}x${Math.round(H / 80)}`;
    if (key === lastSize) return;
    lastSize = key;
    const cell = W < 640 ? 3 : 4;
    GW = Math.max(32, Math.round(W / cell)); GH = Math.max(32, Math.round(H / cell));
    sx = GW / W; sy = GH / H;
    canvas.width = GW; canvas.height = GH;
    image = ctx.createImageData(GW, GH);
    buf = new Uint32Array(image.data.buffer);

    buildTags();
    L = layout(tagWidth());
    buildLanes();
    placeTags();
    base = paintBase();

    // Fill the lanes at once, so the scene never starts empty.
    parts = [];
    for (let i = 0, alive = (L.wide ? 9 : 4.5) * 8; i < alive; i++) {
      spawn();
      const p = parts[parts.length - 1];
      p.d = Math.random() * total(p) * 0.98;
      p.crossed = p.d > lanesIn[p.a].len;
    }
    frame(performance.now());
  }

  build();
  mark.addEventListener("load", () => { lastSize = ""; build(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lastSize = ""; build(); });
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { build(); start(); }, 140);
  }).observe(root);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }, { rootMargin: "60px" }).observe(root);
  document.addEventListener("visibilitychange", start);
  start();
})();
