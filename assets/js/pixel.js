/**
 * Dithered pixel scenes and pixel art.
 *
 * The reference leaned on pixel illustrations. Rinder keeps that language
 * but draws its own scenes procedurally: low resolution canvases, a fixed
 * palette and 4x4 Bayer dithering, scaled up with crisp pixels.
 *
 * Static layers render once per resize into a base buffer. Each frame only
 * copies the base and draws a few moving pixels, and animation stops when
 * a canvas is offscreen or the user prefers reduced motion.
 */
(function () {
  "use strict";

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    // ABGR for little endian Uint32 views
    return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16);
  };
  const ramp = (list) => list.map(hex);

  /** Pick a ramp colour for t in [0,1] with ordered dithering. */
  function dither(r, t, x, y) {
    if (t <= 0) return r[0];
    if (t >= 1) return r[r.length - 1];
    const p = t * (r.length - 1);
    const i = Math.floor(p);
    return p - i > bayer(x, y) ? r[i + 1] : r[i];
  }

  // Seeded random, so scenes look the same on every visit.
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

  // Tileable value noise for drifting clouds.
  function makeNoise(seed, period) {
    const r = rng(seed);
    const size = 256;
    const g = new Float32Array(size * size).map(() => r());
    const at = (x, y) => g[((y % size) + size) % size * size + (((x % period) + period) % period)];
    const smooth = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = smooth(x - xi), yf = smooth(y - yi);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }

  const PAL = {
    nightSky: ramp(["#070d0d", "#091111", "#0b1616", "#0e1c1c", "#112424", "#152e2f", "#1a3a3c", "#214a4d", "#2b5e60", "#3a7775", "#52948e", "#78b6ad", "#a0d7d1"]),
    ground: ramp(["#060b0b", "#081010", "#0a1414", "#0d1a1a", "#102020"]),
    building: ramp(["#070d0d", "#0a1212", "#0d1818", "#12201f", "#182a29", "#20393a"]),
    grid: hex("#1f3a3b"),
    gridHi: hex("#2e5657"),
    star: ramp(["#3a4d4d", "#728383", "#a5afaf", "#cfd3cf", "#fefffc"]),
    window: [hex("#a0d7d1"), hex("#d7b97f"), hex("#cfd3cf"), hex("#78b6ad")],
    mint: ramp(["#2b5e60", "#52948e", "#a0d7d1", "#e6f6f3"]),
    grey: ramp(["#1f3a3b", "#3a5555", "#576a6a", "#728383"]),
    sky: ramp(["#005f93", "#006aa2", "#0074b0", "#0081c0", "#0b89c6", "#1b93cc", "#2f9fd4", "#45acdc", "#5fbbe4", "#7ecbec"]),
    cloud: ramp(["#8fd0ee", "#b5e1f5", "#d7eff9", "#f2fafd", "#ffffff"]),
    dawn: ramp(["#0b1616", "#12292a", "#1d4a4f", "#2a6468", "#3f8583", "#6fb3ab", "#a0d7d1", "#cfebe7"]),
    deep: ramp(["#03263a", "#05344f", "#064465", "#0a5f8c", "#0074b0", "#0081c0", "#2f9fd4"]),
    dusk: ramp(["#131818", "#1d2424", "#2b3232", "#3f4442", "#5a584f", "#7f7358", "#a88f63", "#d7b97f"]),
  };

  /* ---------------- Scenes ---------------- */

  function cityScene(W, H, opts) {
    const r = rng(opts.seed || 7);
    const base = new Uint32Array(W * H);
    const hy = Math.round(H * opts.horizon);
    const cx = W / 2;
    const skyline = new Int16Array(W).fill(hy);

    // Sky with a horizon glow
    for (let y = 0; y < hy; y++) {
      const v = y / hy;
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / (W * 0.42), dy = (y - hy) / (H * opts.glowH);
        const glow = Math.exp(-(dx * dx + dy * dy));
        const t = Math.pow(v, 2.2) * opts.skyLift + glow * opts.glow;
        base[y * W + x] = dither(opts.skyRamp, t, x, y);
      }
    }

    // A pixel ring rising behind the skyline
    if (opts.ring) {
      const rcx = cx, rcy = hy + H * 0.02, rr = Math.min(W * 0.24, H * opts.ring);
      for (let y = Math.max(0, Math.floor(rcy - rr - 3)); y < hy; y++) {
        for (let x = Math.max(0, Math.floor(rcx - rr - 3)); x < Math.min(W, rcx + rr + 3); x++) {
          const d = Math.hypot(x - rcx, y - rcy);
          const band = Math.abs(d - rr);
          const fade = Math.min(1, (hy - y) / (rr * 0.9));
          if (band < 1.6) base[y * W + x] = dither(opts.skyRamp, 0.62 + 0.38 * (1 - band / 1.6) * (0.55 + 0.45 * fade), x, y);
          else if (d < rr - 1.6 && bayer(x, y) < 0.18 * fade) base[y * W + x] = dither(opts.skyRamp, 0.5, x, y);
        }
      }
    }

    // Ground with perspective ledger lines converging on the glow
    for (let y = hy; y < H; y++) {
      const v = (y - hy) / (H - hy);
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / (W * 0.5);
        const glow = Math.exp(-(dx * dx) / 0.35) * Math.max(0, 1 - v * 2.2);
        base[y * W + x] = dither(PAL.ground, 0.85 - v * 0.7 + glow * 0.6, x, y);
      }
    }
    const rays = opts.rays || 15;
    for (let i = 0; i <= rays; i++) {
      const bx = (i / rays) * W * 3 - W;
      for (let y = hy + 1; y < H; y++) {
        const v = (y - hy) / (H - hy);
        const x = Math.round(cx + (bx - cx) * v);
        if (x >= 0 && x < W && bayer(x, y) < 0.85) base[y * W + x] = i === rays / 2 ? PAL.gridHi : PAL.grid;
      }
    }
    for (let k = 1; k < 14; k++) {
      const y = Math.round(hy + Math.pow(k / 14, 2.1) * (H - hy));
      for (let x = 0; x < W; x++) if (bayer(x, y) < 0.55) base[y * W + x] = PAL.grid;
    }

    // Skyline of payment endpoints: taller toward the glow
    const windows = [];
    let x = 0;
    while (x < W) {
      const w = 4 + Math.floor(r() * 9);
      const centre = 1 - Math.min(1, Math.abs(x + w / 2 - cx) / (W * 0.55));
      const h = Math.round((6 + r() * 18 + centre * centre * opts.tower * r()) * (H / 220));
      const top = hy - h;
      for (let yy = Math.max(0, top); yy < hy; yy++) {
        for (let xx = x; xx < Math.min(W, x + w); xx++) {
          const edge = x + w / 2 < cx ? (xx - x) / w : 1 - (xx - x) / w;
          const lit = 0.25 + edge * 0.35 * centre + (1 - (hy - yy) / Math.max(h, 1)) * 0.1;
          base[yy * W + xx] = dither(PAL.building, lit, xx, yy);
        }
        skyline[Math.min(W - 1, x)] = Math.min(skyline[Math.min(W - 1, x)], top);
      }
      for (let yy = top + 2; yy < hy - 1; yy += 2 + (r() > 0.6 ? 1 : 0)) {
        for (let xx = x + 1; xx < x + w - 1; xx += 2) {
          if (r() < 0.16) windows.push({ x: xx, y: yy, c: PAL.window[Math.floor(r() * (r() < 0.8 ? 1 : 4))], p: r() * 6.28, s: 0.2 + r() * 0.8 });
        }
      }
      x += w + (r() < 0.3 ? 1 : 0);
    }

    // Stars
    const stars = [];
    const count = Math.round((W * hy) / 260);
    for (let i = 0; i < count; i++) {
      const sy = Math.floor(Math.pow(r(), 1.6) * hy * 0.8);
      stars.push({ x: Math.floor(r() * W), y: sy, p: r() * 6.28, s: 0.4 + r() * 1.2, b: r() });
    }

    // Transfers travelling up the ledger lines toward the horizon
    const particles = [];
    const pn = opts.particles || 26;
    const spawn = (p, fresh) => {
      p.lane = Math.floor(r() * (rays + 1));
      p.v = fresh ? r() : 1;
      p.speed = 0.0025 + r() * 0.004;
      p.pay = r() < 0.42;
      return p;
    };
    for (let i = 0; i < pn; i++) particles.push(spawn({}, true));

    function frame(buf, t) {
      buf.set(base);
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * 0.001 * s.s + s.p);
        const lvl = s.b * 0.6 + tw * 0.4;
        if (lvl > 0.35) buf[s.y * W + s.x] = PAL.star[Math.min(4, Math.floor(lvl * 5))];
      }
      for (const w of windows) {
        if (Math.sin(t * 0.0004 * w.s + w.p) > -0.55) buf[w.y * W + w.x] = w.c;
      }
      for (const p of particles) {
        p.v -= p.speed * (opts.speed || 1);
        if (p.v <= 0.02) spawn(p, false);
        const bx = (p.lane / rays) * W * 3 - W;
        for (let k = 0; k < 4; k++) {
          const v = p.v + k * 0.012;
          if (v > 1) continue;
          const y = Math.round(hy + v * (H - hy));
          const px = Math.round(cx + (bx - cx) * v);
          if (px < 0 || px >= W || y >= H) continue;
          // Transfers look alike until they are classified mid way
          const classified = p.v < 0.45;
          const r2 = classified ? (p.pay ? PAL.mint : PAL.grey) : PAL.star;
          const lvl = classified && !p.pay ? Math.max(0, 1 - (0.45 - p.v) * 4) : 1;
          const idx = Math.max(0, Math.min(r2.length - 1, Math.round((r2.length - 1) * (1 - k / 4) * lvl)));
          if (lvl > 0.05) buf[y * W + px] = r2[idx];
        }
      }
    }
    return { frame, animated: true };
  }

  function skyScene(W, H, opts) {
    const base = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = (y / H) * 0.85 + (x / W) * 0.12;
        base[y * W + x] = dither(PAL.sky, t, x, y);
      }
    }
    const period = 256;
    const noise = makeNoise(opts.seed || 3, period);
    const scale = 20 * (W / 320);
    const density = (x, y) => {
      const nx = x / scale, ny = y / (scale * 0.7);
      return noise(nx, ny) * 0.55 + noise(nx * 2.1, ny * 2.1) * 0.3 + noise(nx * 4.3, ny * 4.3) * 0.15;
    };
    function frame(buf, t) {
      buf.set(base);
      const off = (t * 0.0012) % (period * scale);
      const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
      for (let y = Math.floor(H * 0.3); y < H; y++) {
        const band = ss(0.3, 0.95, y / H);
        for (let x = 0; x < W; x++) {
          // Keep the copy column clear: clouds gather right and low
          const side = ss(0.28, 0.8, x / W);
          const d = density(x + off, y) * (0.5 + band * 0.6) * (0.55 + side * 0.6);
          if (d > 0.58) {
            const c = (d - 0.58) * 3.2 + (1 - y / H) * 0.2;
            buf[y * W + x] = dither(PAL.cloud, c, x, y);
          }
        }
      }
    }
    return { frame, animated: true, fps: 12 };
  }

  function cardScene(W, H, opts) {
    const r = rng(opts.seed || 11);
    const base = new Uint32Array(W * H);
    const pal = PAL[opts.pal];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - W * opts.gx) / W, dy = (y - H * opts.gy) / H;
        const glow = Math.exp(-(dx * dx + dy * dy) * 3.2);
        base[y * W + x] = dither(pal, glow * 0.95 + (y / H) * 0.08, x, y);
      }
    }
    if (opts.rings) {
      const cx = W * opts.gx, cy = H * opts.gy;
      for (let k = 1; k <= 7; k++) {
        const rad = k * W * 0.07;
        for (let a = 0; a < 6.283; a += 0.8 / rad) {
          const x = Math.round(cx + Math.cos(a) * rad), y = Math.round(cy + Math.sin(a) * rad * 0.92);
          if (x >= 0 && x < W && y >= 0 && y < H && bayer(x, y) < 0.7 - k * 0.06) base[y * W + x] = pal[Math.min(pal.length - 1, 6 - Math.floor(k / 2))];
        }
      }
    }
    if (opts.bars) {
      const hy = Math.round(H * 0.78);
      let x = 0;
      while (x < W) {
        const w = 3 + Math.floor(r() * 5);
        const h = Math.round(3 + r() * H * 0.18 * (1 - Math.abs(x - W * opts.gx) / W));
        for (let yy = hy - h; yy < H; yy++) for (let xx = x; xx < Math.min(W, x + w); xx++) base[yy * W + xx] = dither(pal, 0.05 + (yy > hy ? 0 : 0.1), xx, yy);
        x += w + 1;
      }
    }
    if (opts.nodes) {
      const pts = Array.from({ length: 16 }, () => [Math.floor(r() * W), Math.floor(r() * H * 0.7)]);
      for (const [px, py] of pts) {
        for (const [qx, qy] of pts) {
          if (Math.hypot(px - qx, py - qy) < W * 0.2) {
            const n = Math.max(Math.abs(px - qx), Math.abs(py - qy));
            for (let i = 0; i <= n; i += 2) {
              const x = Math.round(px + ((qx - px) * i) / n), y = Math.round(py + ((qy - py) * i) / n);
              if (y < H && x < W) base[y * W + x] = pal[pal.length - 3];
            }
          }
        }
        base[py * W + px] = pal[pal.length - 1];
      }
    }
    return { frame: (buf) => buf.set(base), animated: false };
  }

  const SCENES = {
    footer: { cell: 4, make: (W, H) => cityScene(W, H, { seed: 19, ring: 0.26, horizon: 0.55, glowH: 0.3, glow: 0.5, skyLift: 0.35, tower: 22, particles: 18, speed: 0.7, skyRamp: PAL.nightSky }) },
    sky: { cell: 4, make: (W, H) => skyScene(W, H, { seed: 5 }) },
    "card-dawn": { cell: 4, make: (W, H) => cardScene(W, H, { pal: "dawn", gx: 0.5, gy: 0.78, bars: true, seed: 3 }) },
    "card-deep": { cell: 4, make: (W, H) => cardScene(W, H, { pal: "deep", gx: 0.5, gy: 0.42, rings: true, seed: 5 }) },
    "card-dusk": { cell: 4, make: (W, H) => cardScene(W, H, { pal: "dusk", gx: 0.62, gy: 0.35, nodes: true, seed: 9 }) },
  };

  function mountScene(canvas) {
    const def = SCENES[canvas.dataset.scene];
    if (!def) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    let scene, image, buf, W, H;
    let visible = false, raf = 0, last = 0;
    const still = window.Rinder && window.Rinder.reducedMotion();

    function build() {
      const rect = canvas.getBoundingClientRect();
      const cell = rect.width < 640 ? def.cell - 1 : def.cell;
      W = Math.max(32, Math.round(rect.width / cell));
      H = Math.max(32, Math.round(rect.height / cell));
      if (canvas.width === W && canvas.height === H && scene) return;
      canvas.width = W;
      canvas.height = H;
      image = ctx.createImageData(W, H);
      buf = new Uint32Array(image.data.buffer);
      scene = def.make(W, H);
      draw(performance.now());
    }
    function draw(t) {
      scene.frame(buf, t);
      ctx.putImageData(image, 0, 0);
    }
    function loop(t) {
      raf = 0;
      if (!visible) return;
      const interval = 1000 / (scene.fps || 30);
      if (t - last >= interval) {
        last = t;
        draw(t);
      }
      raf = requestAnimationFrame(loop);
    }
    const start = () => { if (!raf && scene.animated && !still) raf = requestAnimationFrame(loop); };

    build();
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    }, { rootMargin: "80px" }).observe(canvas);
    let resizeTimer;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { build(); if (visible) start(); }, 120);
    }).observe(canvas);
  }

  /* ---------------- Pixel art: receipt with a verified stablecoin ---------------- */

  function receiptCells() {
    const COLS = 37, ROWS = 56;
    const r = rng(42);
    const cells = [];
    const put = (x, y, c) => { if (x >= 0 && x < COLS && y >= 0 && y < ROWS) cells[y * COLS + x] = c; };
    const paper = ["#fefffc", "#f9faf7", "#eef1ed", "#dee2de"];
    const shade = (x, y, t) => paper[Math.min(3, Math.floor(t * 4 + (bayer(x, y) - 0.5) * 0.9))];

    // Paper body with a torn zigzag foot
    const L = 6, R = 28, T = 10, B = 49;
    const foot = (x) => B + ((((x - L) >> 1) & 1) ? 2 : 0);
    for (let x = L; x <= R; x++) {
      const bottom = foot(x);
      for (let y = T; y <= bottom; y++) {
        const edge = x === L || x === R || y === T || y === bottom;
        put(x, y, edge ? "#a5afaf" : shade(x, y, (x - L) / (R - L) * 0.55 + (y - T) / (B - T) * 0.25));
      }
    }
    for (let y = T + 1; y <= foot(R); y++) put(R + 1, y, "#cfd3cf");

    // Printed lines
    const lines = [[13, 14], [15, 9], [19, 16], [21, 12], [23, 15], [27, 10], [29, 13], [31, 8]];
    for (const [y, w] of lines) for (let x = L + 3; x < L + 3 + w; x++) put(x, y, bayer(x, y) < 0.8 ? "#b4b8b4" : "#cfd3cf");
    for (let x = L + 3; x < R - 2; x++) put(x, 35, (x % 2) ? "#b4b8b4" : undefined);
    for (let x = L + 3; x < L + 10; x++) put(x, 38, "#728383");
    for (let x = R - 9; x < R - 2; x++) { put(x, 38, "#444141"); put(x, 39, "#646464"); }

    // Verification stamp: ring with a check
    const sx = 13, sy = 44;
    for (let a = 0; a < 6.283; a += 0.18) put(Math.round(sx + Math.cos(a) * 4), Math.round(sy + Math.sin(a) * 3.2), "#2d6a64");
    [[-2, 0], [-1, 1], [0, 2], [1, 1], [2, 0], [3, -1]].forEach(([dx, dy]) => put(sx + dx, sy + dy, "#2d6a64"));

    // Stablecoin, overlapping the top right corner
    const cx = 27, cy = 11, rad = 8.2;
    for (let y = cy - 9; y <= cy + 9; y++) {
      for (let x = cx - 9; x <= cx + 9; x++) {
        const d = Math.hypot(x - cx, (y - cy) * 1.02);
        if (d > rad + 0.3) continue;
        let c;
        if (d > rad - 1) c = "#0a5f8c";
        else if (d > rad - 2.2) c = (x + y) % 3 === 0 ? "#a0d7d1" : "#41a1cf";
        else {
          const lightT = ((cx - x) + (cy - y)) / (rad * 2) + 0.5;
          c = lightT + (bayer(x, y) - 0.5) * 0.35 > 0.62 ? "#41a1cf" : lightT > 0.2 ? "#0081c0" : "#0a5f8c";
        }
        put(x, y, c);
      }
    }
    const dollar = ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."];
    dollar.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") put(cx - 2 + x, cy - 3 + y, "#fefffc"); }));
    // Glints
    [[cx - 5, cy - 5], [cx - 6, cy - 4], [cx + 9, cy - 8], [cx + 10, cy - 9], [cx + 11, cy - 8], [cx + 10, cy - 7]].forEach(([x, y]) => put(x, y, "#a0d7d1"));

    // Ground shadow
    for (let x = L - 3; x <= R + 5; x++) {
      const t = 1 - Math.abs(x - (L + R) / 2 - 1) / ((R - L) / 2 + 5);
      if (bayer(x, 54) < t * 0.9) put(x, 54, "#dee2de");
      if (bayer(x, 55) < t * 0.45) put(x, 55, "#eef1ed");
    }

    const out = [];
    cells.forEach((c, i) => { if (c) out.push({ x: i % COLS, y: Math.floor(i / COLS), c, d: Math.floor(i / COLS) * 16 + r() * 260 }); });
    return { cols: COLS, rows: ROWS, cells: out };
  }

  function mountPixelArt(canvas) {
    const art = receiptCells();
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = 300, cssH = 450;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);
    const size = cssW / art.cols * 0.98;
    const offY = (cssH - art.rows * size) / 2;
    const paint = (list) => list.forEach((p) => { ctx.fillStyle = p.c; ctx.fillRect(p.x * size, offY + p.y * size, size + 0.02, size + 0.02); });

    if (window.Rinder && window.Rinder.reducedMotion()) return paint(art.cells);
    const sorted = art.cells.slice().sort((a, b) => a.d - b.d);
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      let i = 0;
      const step = (t) => {
        const el = t - t0;
        const batch = [];
        while (i < sorted.length && sorted[i].d <= el) batch.push(sorted[i++]);
        paint(batch);
        if (i < sorted.length) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.3 });
    io.observe(canvas);
  }

  // The palette and dithering are shared with the hero lens in hero.js.
  window.RinderPixel = { mountScene, mountPixelArt, bayer, dither, hex, ramp, PAL };
})();
