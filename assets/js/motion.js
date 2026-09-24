/**
 * Motion, ported from the reference: word by word blur reveals, rise and
 * scale card reveals, a typewriter line, the rotating compass clock and a
 * navbar that follows the theme of the section beneath it.
 * Everything respects prefers-reduced-motion.
 */
(function () {
  "use strict";
  const R = window.Rinder;
  const still = R.reducedMotion();

  /** Split a headline into words for the blur reveal. */
  function splitWords(el) {
    if (el.dataset.split) return;
    el.dataset.split = "1";
    const label = el.textContent.trim().replace(/\s+/g, " ");
    const words = label.split(" ");
    el.setAttribute("aria-label", label);
    el.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true" style="--i:${i}">${R.esc(w)}${i < words.length - 1 ? " " : ""}</span>`).join("");
  }

  function reveal(selector, options = {}) {
    const els = document.querySelectorAll(selector);
    if (still) return els.forEach((el) => el.classList.add("is-in"));
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    }, { threshold: options.threshold ?? 0.2, rootMargin: options.margin ?? "0px 0px -8% 0px" });
    els.forEach((el) => io.observe(el));
  }

  /** Count a number up once when it scrolls into view. */
  function countUp(el, value, duration = 1400) {
    const render = (n) => (el.firstChild.nodeValue = R.formatNumber(Math.round(n)));
    if (!el.firstChild || el.firstChild.nodeType !== 3) el.prepend(document.createTextNode(""));
    if (still) return render(value);
    render(0);
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        render(value * (1 - Math.pow(1 - p, 4)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
  }

  /** Type, pause, erase, next. The reference's "automating bug reports|". */
  function typewriter(el, phrases) {
    if (still || !phrases.length) return;
    let i = 0, n = el.textContent.length, dir = -1, visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(el);
    const tick = () => {
      let delay = 40;
      if (visible) {
        const text = phrases[i];
        n += dir;
        if (dir > 0 && n >= text.length) { n = text.length; dir = -1; delay = 2200; }
        else if (dir < 0 && n <= 0) { n = 0; dir = 1; i = (i + 1) % phrases.length; delay = 380; }
        else delay = dir > 0 ? 42 : 22;
        el.textContent = phrases[i].slice(0, n);
      } else delay = 400;
      setTimeout(tick, delay);
    };
    phrases.unshift(el.textContent);
    setTimeout(tick, 2600);
  }

  /** UTC clock with the reference's compass needle, turned by the minute. */
  function clock() {
    const time = document.querySelector("[data-clock]");
    const compass = document.querySelector("[data-compass]");
    const cluster = document.querySelector("[data-cluster]");
    if (cluster) cluster.textContent = `Solana ${R.config.clusterLabel}`;
    if (!time) return;
    const update = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      time.textContent = `${hh}:${mm}`;
      if (compass) compass.style.transform = `rotate(${(d.getUTCHours() % 12) * 30 + d.getUTCMinutes() * 0.5 + d.getUTCSeconds() / 120}deg)`;
    };
    update();
    setInterval(update, 10000);
  }

  /** Light or dark nav, depending on what sits under it. */
  function navTheme() {
    const nav = document.querySelector("[data-nav]");
    const sections = [...document.querySelectorAll("[data-nav-theme]")];
    if (!nav || !sections.length) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = nav.getBoundingClientRect().bottom - 8;
      let theme = "dark";
      for (const s of sections) {
        const r = s.getBoundingClientRect();
        if (r.top <= y && r.bottom > y) { theme = s.dataset.navTheme; break; }
      }
      nav.classList.toggle("is-light", theme === "light");
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener("resize", update);
    update();
  }

  /** On touch screens there is no hover, so the pills show on scroll. */
  function pillWord() {
    const el = document.querySelector("[data-pillword]");
    if (!el || matchMedia("(hover: hover)").matches) return;
    new IntersectionObserver(([e]) => el.classList.toggle("is-auto", e.isIntersecting), { rootMargin: "-35% 0px -35% 0px" }).observe(el);
  }

  window.RinderMotion = { splitWords, reveal, countUp, typewriter };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-words]").forEach(splitWords);
    const hero = document.querySelector(".hero__title");
    if (hero && !still) requestAnimationFrame(() => setTimeout(() => hero.classList.add("is-in"), 120));
    reveal("[data-words]:not(.hero__title)", { threshold: 0.4 });
    reveal("[data-reveal]", { threshold: 0.12 });
    if (still && hero) hero.classList.add("is-in");
    clock();
    navTheme();
    pillWord();
  });
})();
