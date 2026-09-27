/**
 * Hero visual: the Rinder lens.
 *
 * Stablecoin transfers drift in from the left, all the same neutral light.
 * They pass through the lens core and leave to the right, sorted into the
 * seven classifications, each in its own colour. On wide screens they land
 * on a column of labels that light up as they arrive.
 *
 * Two canvases. The backdrop (sky, stars, lane guides, lens ring and dial,
 * the core with the mark, the dotted mirror floor) renders once per resize
 * at full resolution. The animated layer only covers the band the lanes run
 * through, holds nothing but soft glows (sweep, particles, core pulse) and so
 * renders at a lower resolution, like the pixel scenes before it. Animation
 * stops offscreen, in hidden tabs and for reduced motion, which gets a single
 * still frame instead. Slow devices drop to 30 fps.
 */
(function () {
  "use strict";

  const root = document.querySelector("[data-hero-art]");
  if (!root) return;
  const Rn = window.Rinder;
  const still = Rn && Rn.reducedMotion();
  const back = root.querySelector("[data-hero-back]");
  const fx = root.querySelector("[data-hero-fx]");
  const tagBox = root.querySelector("[data-hero-tags]");
  const bctx = back.getContext("2d");
  const ctx = fx.getContext("2d");
  const hero = root.parentElement;

  const NEUTRAL = [226, 234, 230];
  const LIME = [192, 255, 1];
  const MINT = [160, 215, 209];
  // Top to bottom on the right. The weight is how often a transfer lands there.
  const OUT = [
    { key: "DIRECT_PAYMENT", rgb: [192, 255, 1], w: 0.19 },
    { key: "PAYMENT_GATEWAY", rgb: [218, 255, 120], w: 0.21 },
    { key: "DEFI", rgb: [111, 227, 210], w: 0.16 },
    { key: "EXCHANGE", rgb: [80, 172, 222], w: 0.14 },
    { key: "TREASURY", rgb: [226, 190, 122], w: 0.1 },
    { key: "INTERNAL_TRANSFER", rgb: [168, 186, 240], w: 0.11 },
    { key: "UNKNOWN", rgb: [150, 158, 154], w: 0.09 },
  ];
  const IN_LANES = 6;
  const NEUTRAL_I = OUT.length, WHITE = OUT.length + 1, CELL = 32;
  const DOTS = [...OUT.map((o) => o.rgb), NEUTRAL, [255, 255, 255]];
  const STEP = 3; // lane resolution in CSS px

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
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

  /* ---------------- Lanes ---------------- */

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

  let W = 0, H = 0, dpr = 1, fdpr = 1, L = null;
  let lanesIn = [], lanesOut = [], parts = [], stars = [], tags = [];
  let ringSprite = null, dialSprite = null, sweepSprite = null, coreSprite = null, coreRing = null, atlas = null;
  let pulse = 0, spawnDebt = 0, visible = true, raf = 0, last = 0, lastSize = "";
  let lite = false, slow = 0, frames = 0;
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
    L.rc = Math.max(24, L.r * 0.19);
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
      const end = [cx - rc - 2, cy + (u - 0.5) * rc * 0.5];
      lanesIn.push(resample(bezier([x0, y0], [x0 + (cx - x0) * 0.46, y0], [end[0] - r * 0.62, cy + (y0 - cy) * 0.12], end, 90)));
    }
    lanesOut = OUT.map((c, j) => {
      const y1 = L.tags ? cy + (j - (OUT.length - 1) / 2) * L.gap : cy + (j / (OUT.length - 1) - 0.5) * 2.5 * r;
      const x1 = L.tags ? L.colX - 8 : W + 40;
      const start = [cx + rc + 2, cy + (j / (OUT.length - 1) - 0.5) * rc * 0.5];
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

  function spawn(d) {
    const out = pick();
    const pay = out < 2;
    parts.push({
      a: (Math.random() * IN_LANES) | 0, b: out, d: d || 0,
      v: (L.wide ? 150 : 90) * (0.8 + Math.random() * 0.5),
      w: (pay ? 1.7 : 1.3) * (0.8 + Math.random() * 0.5),
      tail: (L.wide ? 46 : 30) * (0.7 + Math.random() * 0.7),
      crossed: false,
    });
  }

  // Distance along the joined path: in lane, a hidden hop behind the core, out lane.
  function hop() { return L.rc * 2 + 4; }
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

  /* ---------------- Sprites ---------------- */

  function sprite(size, draw) {
    const c = document.createElement("canvas");
    c.width = c.height = Math.ceil(size * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    g.translate(size / 2, size / 2);
    draw(g);
    return c;
  }

  function buildSprites() {
    const { r } = L;
    const size = r * 2.5;
    ringSprite = sprite(size, (g) => {
      const conic = g.createConicGradient ? g.createConicGradient(-Math.PI / 2, 0, 0) : null;
      const stroke = conic || rgba(LIME, 0.8);
      if (conic) {
        conic.addColorStop(0, rgba(LIME, 0.95));
        conic.addColorStop(0.2, rgba(MINT, 0.6));
        conic.addColorStop(0.5, rgba([40, 90, 86], 0.25));
        conic.addColorStop(0.8, rgba(MINT, 0.6));
        conic.addColorStop(1, rgba(LIME, 0.95));
      }
      // glass thickness
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2);
      g.lineWidth = r * 0.07; g.strokeStyle = rgba(MINT, 0.045); g.stroke();
      // lit rim with glow
      g.shadowColor = rgba(LIME, 0.55); g.shadowBlur = 22;
      g.lineWidth = Math.max(2, r * 0.012); g.strokeStyle = stroke; g.stroke();
      g.shadowBlur = 0;
      g.lineWidth = 0.8; g.strokeStyle = "rgba(255,255,255,0.35)"; g.stroke();
      // inner and outer hairlines
      for (const [k, a] of [[0.955, 0.12], [1.045, 0.08]]) {
        g.beginPath(); g.arc(0, 0, r * k, 0, Math.PI * 2);
        g.lineWidth = 1; g.strokeStyle = rgba(MINT, a); g.stroke();
      }
    });
    dialSprite = sprite(size, (g) => {
      g.lineWidth = 1;
      for (let k = 0; k < 180; k++) {
        const a = (k / 180) * Math.PI * 2;
        const major = k % 15 === 0, minor = k % 5 === 0;
        const r0 = r * 1.085, r1 = r0 + (major ? 11 : minor ? 6 : 3);
        g.strokeStyle = major ? "rgba(207,211,207,0.5)" : "rgba(207,211,207,0.2)";
        g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke();
      }
      g.fillStyle = "rgba(160,215,209,0.22)";
      for (let k = 0; k < 120; k++) {
        const a = (k / 120) * Math.PI * 2;
        g.fillRect(Math.cos(a) * r * 0.88 - 0.6, Math.sin(a) * r * 0.88 - 0.6, 1.2, 1.2);
      }
    });
    // One atlas holds every soft dot, so particles, trails and glows draw from a single texture.
    atlas = document.createElement("canvas");
    atlas.width = Math.ceil(CELL * dpr) * DOTS.length; atlas.height = Math.ceil(CELL * dpr);
    const ag = atlas.getContext("2d");
    DOTS.forEach((c, i) => {
      const x = (i + 0.5) * Math.ceil(CELL * dpr), y = atlas.height / 2, rr = atlas.height / 2;
      const grd = ag.createRadialGradient(x, y, 0, x, y, rr);
      const white = i === WHITE;
      grd.addColorStop(0, rgba(c, 1));
      grd.addColorStop(white ? 0.3 : 0.18, rgba(c, white ? 0.7 : 0.55));
      grd.addColorStop(white ? 0.6 : 0.45, rgba(c, white ? 0.12 : 0.14));
      grd.addColorStop(1, rgba(c, 0));
      ag.fillStyle = grd; ag.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    });
    // The sweep: an arc brightening towards its head, rotated each frame.
    sweepSprite = sprite(r * 2.3, (g) => {
      const span = Math.PI * 2 * 0.13, n = 48;
      for (let i = 0; i < n; i++) {
        const f = (i + 1) / n;
        g.beginPath(); g.arc(0, 0, r, (i / n) * span, ((i + 1) / n) * span);
        g.strokeStyle = rgba(LIME, 0.18 * f); g.lineWidth = r * 0.06; g.stroke();
        g.strokeStyle = rgba(LIME, 0.9 * f); g.lineWidth = Math.max(2, r * 0.013); g.stroke();
      }
    });
    const { rc } = L;
    coreSprite = sprite(rc * 2 + 6, (g) => {
      const disc = g.createRadialGradient(0, -rc * 0.4, 0, 0, 0, rc);
      disc.addColorStop(0, "#132222");
      disc.addColorStop(1, "#070e0e");
      g.fillStyle = disc;
      g.beginPath(); g.arc(0, 0, rc, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(0, 0, rc * 0.8, 0, Math.PI * 2);
      g.lineWidth = 1; g.strokeStyle = "rgba(255,255,255,0.07)"; g.stroke();
      if (mark.complete && mark.naturalWidth) {
        const mh = rc * 0.95, mw = (mh * mark.naturalWidth) / mark.naturalHeight;
        g.drawImage(mark, -mw / 2, -mh / 2, mw, mh);
      }
    });
    coreRing = sprite(rc * 2 + 24, (g) => {
      g.beginPath(); g.arc(0, 0, rc, 0, Math.PI * 2);
      g.shadowColor = rgba(LIME, 0.8); g.shadowBlur = 8;
      g.lineWidth = 1.5; g.strokeStyle = rgba(LIME, 1); g.stroke();
    });
  }

  function stamp(g, i, x, y, size, alpha) {
    const s = atlas.height;
    g.globalAlpha = alpha;
    g.drawImage(atlas, i * s, 0, s, s, x - size / 2, y - size / 2, size, size);
  }
  function blit(g, img, x, y, alpha) {
    const s = img.width / dpr;
    g.globalAlpha = alpha;
    g.drawImage(img, x - s / 2, y - s / 2, s, s);
  }

  /* ---------------- Backdrop ---------------- */

  function glow(g, x, y, rx, ry, stops) {
    g.save();
    g.translate(x, y); g.scale(1, ry / rx);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    for (const [o, c] of stops) grd.addColorStop(o, c);
    g.fillStyle = grd;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  }

  function drawBack() {
    const g = bctx;
    const { cx, cy, r, horizon } = L;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = "source-over";
    const sky = g.createLinearGradient(0, 0, 0, H);
    const hz = clamp(horizon / H, 0.1, 0.95);
    sky.addColorStop(0, "#050a0a");
    sky.addColorStop(hz * 0.55, "#081111");
    sky.addColorStop(hz, "#0e2020");
    sky.addColorStop(Math.min(1, hz + 0.02), "#0a1515");
    sky.addColorStop(1, "#040808");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    g.globalCompositeOperation = "lighter";
    glow(g, cx, horizon, W * 0.75, r * 0.9, [[0, "rgba(70,170,158,0.22)"], [0.45, "rgba(40,110,104,0.08)"], [1, "rgba(0,0,0,0)"]]);
    glow(g, cx, cy, r * 2.4, r * 2.4, [[0, "rgba(192,255,1,0.07)"], [0.35, "rgba(111,227,210,0.05)"], [1, "rgba(0,0,0,0)"]]);
    glow(g, W * 0.12, H * 0.08, W * 0.45, W * 0.3, [[0, "rgba(65,161,207,0.07)"], [1, "rgba(0,0,0,0)"]]);
    glow(g, W * 0.95, H * 0.02, W * 0.35, W * 0.25, [[0, "rgba(111,227,210,0.05)"], [1, "rgba(0,0,0,0)"]]);

    // stars, thinning towards the horizon
    const rand = rng(11);
    const count = Math.round((W * horizon) / 5200);
    for (let i = 0; i < count; i++) {
      const x = rand() * W, y = rand() * (horizon - 24);
      const fade = clamp((horizon - 24 - y) / (horizon * 0.5), 0, 1);
      const s = rand() < 0.08 ? 1.6 : rand() < 0.4 ? 1.1 : 0.7;
      g.fillStyle = `rgba(226,240,236,${(0.12 + rand() * 0.55) * fade})`;
      g.fillRect(x, y, s, s);
    }

    // horizon line and the light it spills
    const line = g.createLinearGradient(0, 0, W, 0);
    line.addColorStop(0, "rgba(160,215,209,0)");
    line.addColorStop(clamp(cx / W, 0.1, 0.9), "rgba(200,240,220,0.5)");
    line.addColorStop(1, "rgba(160,215,209,0)");
    g.fillStyle = line;
    g.fillRect(0, horizon - 0.5, W, 1);
    const band = g.createLinearGradient(0, horizon - 70, 0, horizon);
    band.addColorStop(0, "rgba(111,227,210,0)");
    band.addColorStop(1, "rgba(111,227,210,0.06)");
    g.fillStyle = band;
    g.fillRect(0, horizon - 70, W, 70);

    // lens glass
    g.globalCompositeOperation = "source-over";
    const disc = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    disc.addColorStop(0, "rgba(4,9,9,0.4)");
    disc.addColorStop(0.7, "rgba(8,18,18,0.35)");
    disc.addColorStop(1, "rgba(111,227,210,0.1)");
    g.fillStyle = disc;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();

    // ring and dial, with the ring mirrored in the floor
    const s = ringSprite.width / dpr;
    g.drawImage(dialSprite, cx - s / 2, cy - s / 2, s, s);
    g.drawImage(ringSprite, cx - s / 2, cy - s / 2, s, s);
    g.save();
    g.beginPath(); g.rect(0, horizon, W, H - horizon); g.clip();
    g.globalAlpha = 0.12;
    g.translate(cx, 2 * horizon - cy); g.scale(1, -1);
    g.drawImage(ringSprite, -s / 2, -s / 2, s, s);
    g.restore();
    g.save();
    g.beginPath(); g.rect(0, horizon, W, H - horizon); g.clip();
    g.translate(0, 2 * horizon); g.scale(1, -1);
    drawCore(g, 0.22);
    g.restore();
    const fade = g.createLinearGradient(0, horizon, 0, horizon + r * 1.4);
    fade.addColorStop(0, "rgba(10,21,21,0)");
    fade.addColorStop(1, "rgba(10,21,21,1)");
    g.fillStyle = fade;
    g.fillRect(0, horizon + 0.5, W, r * 1.4);
    const floor = g.createLinearGradient(0, horizon + r * 1.4, 0, H);
    floor.addColorStop(0, "#0a1515");
    floor.addColorStop(1, "#040808");
    g.fillStyle = floor;
    g.fillRect(0, horizon + r * 1.4, W, Math.max(0, H - horizon - r * 1.4));

    // a pool of light on the floor under the lens
    g.globalCompositeOperation = "lighter";
    glow(g, cx, horizon + r * 0.35, r * 1.6, r * 0.45, [[0, "rgba(192,255,1,0.05)"], [0.5, "rgba(111,227,210,0.04)"], [1, "rgba(0,0,0,0)"]]);
    g.globalCompositeOperation = "source-over";

    drawFloor(g);

    // lane guides: dotted going in, solid coming out
    g.lineWidth = 1;
    g.setLineDash([1, 5]);
    g.strokeStyle = "rgba(226,234,230,0.13)";
    for (const lane of lanesIn) strokeLane(g, lane);
    g.setLineDash([]);
    lanesOut.forEach((lane, j) => { g.strokeStyle = rgba(OUT[j].rgb, 0.14); strokeLane(g, lane); });

    drawCore(g, 1);

    // vignette
    glow(g, W / 2, H * 0.45, Math.max(W, H) * 0.8, Math.max(W, H) * 0.8, [[0.55, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.45)"]]);
  }

  // A perspective field of dots, lit lime under the lens and fading into the distance.
  function drawFloor(g) {
    const { cx, horizon, r } = L;
    const zNear = 1.6, rows = 30, dz = 0.6;
    const f = (H + 12 - horizon) * zNear;
    const sp = (L.wide ? 24 : 18) / (f / zNear);
    const size0 = L.wide ? 1.9 : 1.6;
    for (const [color, pass] of [["#8fcfc6", 0], ["#c0ff01", 1]]) {
      g.fillStyle = color;
      for (let j = 0; j < rows / dz; j++) {
        const z = zNear + (j + 0.65) * dz;
        const sy0 = horizon + f / z;
        if (sy0 > H + 20) continue;
        const fog = Math.pow(1 - (z - zNear) / (rows + 1), 1.5) * clamp((sy0 - horizon) / 26, 0, 1);
        const lod = z < 4 ? 1 : z < 8 ? 2 : z < 16 ? 4 : 8;
        const span = ((W / 2 + 40) * z) / f;
        const i0 = Math.ceil(-span / sp / lod) * lod, i1 = Math.floor(span / sp / lod) * lod;
        const sz = Math.max(1, ((size0 * zNear) / z) * 1.4);
        for (let i = i0; i <= i1; i += lod) {
          const X = i * sp;
          const wave = Math.sin(X * 0.9 + z * 0.55) * 0.05 + Math.sin(X * 0.37 - z * 0.8) * 0.035;
          const sx = cx + (f * X) / z, sy = sy0 - (f * wave) / z;
          const dx = (sx - cx) / (r * 1.5);
          const lit = Math.exp(-dx * dx);
          const a = pass ? fog * lit * 0.6 : fog * (0.22 + 0.4 * lit) * (1 - lit * 0.5);
          if (a < 0.02) continue;
          g.globalAlpha = Math.min(0.72, a);
          g.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
        }
      }
    }
    g.globalAlpha = 1;
  }

  function strokeLane(g, lane) {
    const p = lane.pts;
    g.beginPath(); g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 6) g.lineTo(p[i], p[i + 1]);
    g.lineTo(p[p.length - 2], p[p.length - 1]);
    g.stroke();
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

  function drawSweep(t) {
    const a = still ? -0.6 : (t * 0.0007) % (Math.PI * 2);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(L.cx, L.cy); ctx.rotate(a);
    blit(ctx, sweepSprite, 0, 0, 1);
    ctx.restore();
  }

  // Each particle is a head and a trail of fading dots stamped from the atlas.
  function drawParticles() {
    ctx.globalCompositeOperation = "lighter";
    const h = hop();
    for (const p of parts) {
      const A = lanesIn[p.a].len;
      const tail = Math.min(p.tail, p.d);
      const n = Math.min(16, Math.ceil(tail / 3.5));
      for (let k = n; k >= 1; k--) {
        const d = p.d - (tail * k) / n;
        if (d > A - 2 && d < A + h + 2) continue;
        const sorted = d > A + h;
        const f = 1 - k / (n + 1);
        place(p, d, tmp);
        stamp(ctx, sorted ? p.b : NEUTRAL_I, tmp[0], tmp[1], (6 + p.w * 3) * (0.5 + f * 0.5), (sorted ? 0.5 : 0.36) * f);
      }
      if (p.d > A - 2 && p.d < A + h + 2) continue;
      const sorted = p.d > A + h;
      place(p, p.d, pos);
      stamp(ctx, sorted ? p.b : NEUTRAL_I, pos[0], pos[1], sorted ? 15 + p.w * 6 : 10 + p.w * 4, sorted ? 1 : 0.8);
      stamp(ctx, WHITE, pos[0], pos[1], 4 + p.w * 1.5, 0.95);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawCore(g, alpha) {
    const { cx, cy, rc } = L;
    g.globalCompositeOperation = "lighter";
    stamp(g, 0, cx, cy, rc * 7, 0.22 * alpha);
    g.globalCompositeOperation = "source-over";
    blit(g, coreSprite, cx, cy, alpha);
    blit(g, coreRing, cx, cy, 0.5 * alpha);
    g.globalAlpha = 1;
  }

  // Each transfer that crosses the core makes it flare for a moment.
  function drawPulse() {
    if (pulse < 0.02) return;
    const { cx, cy, rc } = L;
    ctx.globalCompositeOperation = "lighter";
    stamp(ctx, 0, cx, cy, rc * 7, pulse * 0.35);
    blit(ctx, coreRing, cx, cy, pulse * 0.6);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawTwinkles(t) {
    ctx.fillStyle = "#e8f4f0";
    for (const s of stars) {
      const v = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
      ctx.globalAlpha = 0.1 + 0.8 * v * v * v;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  function step(dt) {
    const rate = L.wide ? 9 : 4.5;
    spawnDebt += rate * dt;
    while (spawnDebt >= 1) { spawn(0); spawnDebt -= 1; }
    const { cx, cy, r } = L;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      place(p, p.d, pos);
      const near = Math.hypot(pos[0] - cx, pos[1] - cy) / (r * 1.2);
      p.d += p.v * dt * (0.4 + 0.6 * clamp(near, 0, 1));
      const A = lanesIn[p.a].len;
      if (!p.crossed && p.d > A + hop() / 2) { p.crossed = true; pulse = Math.min(1, pulse + 0.22); }
      if (p.d >= total(p)) { hit(p.b); parts.splice(i, 1); }
    }
    pulse *= Math.pow(0.08, dt);
  }

  function frame(t) {
    ctx.setTransform(fdpr, 0, 0, fdpr, 0, -L.top * fdpr);
    ctx.clearRect(0, L.top, W, L.band);
    drawTwinkles(t);
    drawSweep(t);
    drawParticles();
    drawPulse();
  }

  function loop(t) {
    raf = 0;
    if (!visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
    const gap = last ? (t - last) / 1000 : 0;
    if (lite && gap && gap < 1 / 32) return;
    last = t;
    // Frames that keep arriving late for two seconds: drop to 30 fps and coarser canvases.
    if (!lite && gap) {
      frames++;
      slow = gap > 1 / 45 ? slow + gap : Math.max(0, slow - gap);
      if (frames > 40 && slow > 2) { lite = true; lastSize = ""; build(); }
    }
    step(Math.min(0.05, gap));
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
    dpr = lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    fdpr = lite ? 0.5 : Math.min(window.devicePixelRatio || 1, 2) * 0.6;
    back.width = Math.round(W * dpr); back.height = Math.round(H * dpr);

    buildTags();
    L = layout(tagWidth());
    buildLanes();
    // The animated canvas only spans the band the lanes, lens and dial occupy.
    let lo = L.cy - L.r * 1.3, hi = L.cy + L.r * 1.3;
    for (const lane of [...lanesIn, ...lanesOut]) {
      for (let i = 1; i < lane.pts.length; i += 2) { lo = Math.min(lo, lane.pts[i]); hi = Math.max(hi, lane.pts[i]); }
    }
    L.top = Math.max(0, Math.floor(lo - 30));
    L.band = Math.min(H, Math.ceil(hi + 30)) - L.top;
    fx.style.top = `${L.top}px`;
    fx.style.height = `${L.band}px`;
    fx.width = Math.round(W * fdpr); fx.height = Math.round(L.band * fdpr);
    buildSprites();
    drawBack();
    placeTags();

    const rand = rng(23);
    stars = Array.from({ length: Math.round(W / 40) }, () => ({
      x: rand() * W, y: L.top + rand() * Math.min(L.band, L.horizon - L.top - 20), s: rand() < 0.3 ? 2 : 1.5,
      sp: 0.0006 + rand() * 0.0016, ph: rand() * 6.28,
    }));

    // Fill the lanes at once, so the scene never starts empty.
    parts = [];
    const alive = (L.wide ? 9 : 4.5) * 8;
    for (let i = 0; i < alive; i++) {
      spawn(0);
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
