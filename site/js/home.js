import {
  animate, createTimeline, createTimer, createAnimatable, createDraggable, createLayout,
  onScroll, stagger, spring, splitText, scrambleText, svg, utils,
} from '/vendor/anime/anime.esm.min.js';
import { createCr8Scope } from '/shared/motion/scope.js';
import { heroSvgMarkup, mountHero } from '/shared/motion/hero.js';

// Only now that the motion code has loaded do we hide things to animate in
// (see `.js` rules in site.css). Without JS everything is simply visible.
document.documentElement.classList.add('js');

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const RELEASES = 'https://github.com/holaefrain/CR8/releases/latest/download';

// ── Hero ─────────────────────────────────────────────────
function heroIntro() {
  const { words } = splitText('.hero-title', { words: { wrap: 'clip' } });
  createTimeline({ defaults: { ease: 'out(4)' } })
    .add(words, { y: ['110%', '0%'], duration: 900, delay: stagger(80) }, 200)
    .add('[data-reveal]', { opacity: [0, 1], y: [18, 0], duration: 700, delay: stagger(110) }, '-=500');
}

function nowPlaying() {
  const readouts = ['124 BPM · 8A', '128 BPM · 5A', '122 BPM · 11B', '126 BPM · 2A', '120 BPM · 9B'];
  let i = 0;
  createTimer({
    duration: 2800,
    loop: true,
    onLoop: () => {
      i = (i + 1) % readouts.length;
      animate('#np-value', { innerHTML: scrambleText({ text: readouts[i], chars: '0-9' }), duration: 900 });
    },
  });
}

function parallax() {
  const art = $('.hero-art');
  const follow = createAnimatable(art, { x: 600, y: 600, ease: 'out(3)' });
  const onMove = e => {
    const { innerWidth: w, innerHeight: h } = window;
    follow.x(utils.mapRange(e.clientX, 0, w, -14, 14));
    follow.y(utils.mapRange(e.clientY, 0, h, -10, 10));
  };
  window.addEventListener('mousemove', onMove);
  return () => window.removeEventListener('mousemove', onMove);
}

// ── Features ─────────────────────────────────────────────
function features() {
  const sync = 'play none none reverse';
  animate('.feature', {
    opacity: [0, 1], y: [48, 0], duration: 800, ease: 'out(4)', delay: stagger(90),
    autoplay: onScroll({ target: '.feature-grid', enter: 'bottom-=10% top', sync }),
  });
  animate(svg.createDrawable('[data-feature=search] .draw'), {
    draw: ['0 0', '0 1'], duration: 900, ease: 'inOut(3)', delay: stagger(200, { start: 300 }),
    autoplay: onScroll({ target: '.feature-grid', enter: 'bottom-=10% top', sync }),
  });
  const counter = { bpm: 96 };
  animate(counter, {
    bpm: 124, duration: 1400, ease: 'out(3)', delay: 300,
    onUpdate: () => { $('#bpm-count').textContent = Math.round(counter.bpm); },
    autoplay: onScroll({ target: '.feature-grid', enter: 'bottom-=10% top', sync }),
  });
  animate('.label-strip', {
    y: [-28, 4], duration: 1100, ease: spring({ bounce: 0.3, duration: 1100 }), delay: 400,
    autoplay: onScroll({ target: '.feature-grid', enter: 'bottom-=10% top', sync }),
  });
  const path = svg.createMotionPath('#sync-path');
  animate('.sync-dot', {
    ...path, duration: 3200, ease: 'linear', loop: true, delay: stagger(1600),
  });
}

// ── Camelot wheel ────────────────────────────────────────
const CAMELOT_KEYS = {
  A: ['Ab min', 'Eb min', 'Bb min', 'F min', 'C min', 'G min', 'D min', 'A min', 'E min', 'B min', 'F# min', 'Db min'],
  B: ['B maj', 'F# maj', 'Db maj', 'Ab maj', 'Eb maj', 'Bb maj', 'F maj', 'C maj', 'G maj', 'D maj', 'A maj', 'E maj'],
};

function arc(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)].map(n => n.toFixed(2)).join(' ');
  return `M${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
}

function buildCamelotWheel(el) {
  const c = 260, step = (2 * Math.PI) / 12;
  let segs = '';
  for (let n = 1; n <= 12; n++) {
    const a0 = (n - 0.5) * step, a1 = a0 + step; // 12 at the top, clockwise like a clock
    const mid = (a0 + a1) / 2;
    for (const [ring, r0, r1] of [['B', 170, 240], ['A', 100, 166]]) {
      const tr = (r0 + r1) / 2;
      const [tx, ty] = [c + tr * Math.sin(mid), c - tr * Math.cos(mid)];
      segs += `<g data-key="${n}${ring}"><title>${n}${ring} — ${CAMELOT_KEYS[ring][n - 1]}</title>
        <path class="cw-seg ${ring === 'B' ? 'outer' : 'inner'}" d="${arc(c, c, r0, r1, a0, a1)}"/>
        <text class="cw-text" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${n}${ring}</text></g>`;
    }
  }
  el.innerHTML = `<svg viewBox="0 0 520 520">${segs}
    <circle class="cw-center" cx="260" cy="260" r="92"/>
    <defs>
      <polygon id="cw-shape-a" points="260,214 302,290 218,290"/>
      <polygon id="cw-shape-b" points="224,224 296,224 296,296 224,296"/>
    </defs>
    <polygon class="cw-glyph" id="cw-glyph" points="260,214 302,290 218,290"/>
  </svg>`;
}

function lightKey(code) {
  const n = parseInt(code, 10), ring = code.slice(-1);
  const wrap = k => ((k + 11) % 12) + 1;
  const near = new Set([`${wrap(n - 1)}${ring}`, `${wrap(n + 1)}${ring}`, `${n}${ring === 'A' ? 'B' : 'A'}`]);
  $$('#camelot-wheel [data-key]').forEach(g => {
    const k = g.dataset.key;
    g.querySelector('.cw-seg').classList.toggle('on', k === code);
    g.querySelector('.cw-text').classList.toggle('on', k === code);
    g.querySelector('.cw-seg').classList.toggle('lit', near.has(k));
  });
  return ring;
}

let hovering = false;
function camelotHover() {
  const wheel = $('#camelot-wheel');
  const over = e => {
    const g = e.target.closest('[data-key]');
    if (!g) return;
    hovering = true;
    morphGlyph(lightKey(g.dataset.key));
  };
  const out = () => { hovering = false; };
  wheel.addEventListener('mouseover', over);
  wheel.addEventListener('mouseleave', out);
  return () => { wheel.removeEventListener('mouseover', over); wheel.removeEventListener('mouseleave', out); };
}

let glyphRing = 'A';
function morphGlyph(ring) {
  if (ring === glyphRing) return;
  glyphRing = ring;
  animate('#cw-glyph', { points: svg.morphTo(ring === 'A' ? '#cw-shape-a' : '#cw-shape-b'), duration: 450, ease: 'inOut(3)' });
}

function camelot() {
  const removeHover = camelotHover();
  // Scrolling through the section walks the highlight around the wheel.
  const state = { step: 0 };
  animate(state, {
    step: 23,
    ease: 'linear',
    onUpdate: () => {
      if (hovering) return;
      const s = Math.round(state.step);
      morphGlyph(lightKey(`${(s % 12) + 1}${s < 12 ? 'B' : 'A'}`));
    },
    autoplay: onScroll({ target: '.camelot', enter: 'bottom top', leave: 'top bottom', sync: 0.25 }),
  });
  return removeHover;
}

// ── Crate ────────────────────────────────────────────────
const SLEEVES = [
  ['Night Drive', 'A1', '122', '8A', '#2f4bff'], ['Basement Hours', 'B2', '126', '9A', '#e5352b'],
  ['Warehouse Sun', 'A2', '124', '11B', '#0f9d58'], ['Low End Theory', 'B1', '118', '4A', '#f2a900'],
  ['Last Train', 'A3', '128', '5A', '#8a5cff'], ['Afterglow', 'B3', '120', '2B', '#00a3c4'],
  ['Deep Cut', 'A1', '123', '6A', '#ff6f91'], ['Sunrise Set', 'B2', '125', '10B', '#2f4bff'],
];

function buildCrate(el) {
  el.innerHTML = SLEEVES.map(([title, side, bpm, key, color]) => `
    <article class="sleeve" style="--sleeve:${color}">
      <div class="sleeve-art"><span></span></div>
      <div class="sleeve-meta">
        <div class="sleeve-title">${title}</div>
        <div class="sleeve-tags"><span>${side}</span><span>${bpm} BPM</span><span>${key}</span></div>
      </div>
    </article>`).join('');
}

function crateDrag() {
  const crate = $('#crate'), viewport = $('.crate-viewport');
  const sleeveWidth = $('.sleeve').getBoundingClientRect().width + 18;
  // Bounds in translate space [top, right, bottom, left]: slide left until
  // the last sleeve meets the viewport's right padding, never past the start.
  const bounds = () => {
    const cs = getComputedStyle(viewport);
    const visible = viewport.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return [0, 0, 0, -Math.max(0, crate.offsetWidth - visible)];
  };
  createDraggable(crate, {
    container: bounds,
    x: { snap: sleeveWidth },
    y: false,
    releaseEase: spring({ bounce: 0.2 }),
  });
}

function revealSleeves() {
  animate('.sleeve', {
    opacity: [0, 1], x: [60, 0], rotate: [4, 0], duration: 700, ease: 'out(3)', delay: stagger(60),
    autoplay: onScroll({ target: '.crate-viewport', enter: 'bottom-=10% top', sync: 'play none none reverse' }),
  });
}

// ── How it works ─────────────────────────────────────────
function howItWorks() {
  animate(svg.createDrawable('.how-line path'), {
    draw: ['0 0', '0 1'], ease: 'linear',
    autoplay: onScroll({ target: '.how-steps', enter: 'bottom-=20% top', leave: 'center+=10% center', sync: true }),
  });
  for (const step of $$('.how-step')) {
    animate(step, {
      opacity: [0, 1], x: [-24, 0], duration: 600, ease: 'out(3)',
      autoplay: onScroll({ target: step, enter: 'bottom-=25% top', sync: 'play none none reverse' }),
    });
  }
}

// ── FAQ: smooth reflow when items open/close ─────────────
function faqAccordion() {
  const layout = createLayout('#faq-list', { children: 'details', duration: 380, ease: 'out(3)' });
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('#faq-list').addEventListener('click', e => {
    const summary = e.target.closest('summary');
    if (!summary || reduce()) return;
    e.preventDefault();
    const item = summary.parentElement;
    layout.update(() => { item.open = !item.open; });
  });
}

// ── Final CTA ────────────────────────────────────────────
function finalCta() {
  const { chars } = splitText('[data-wave]', { chars: true });
  animate(chars, {
    y: [0, -14, 0], duration: 900, ease: 'inOut(2)', delay: stagger(40), loop: true, loopDelay: 1800,
    autoplay: onScroll({ target: '.final', sync: 'play pause' }),
  });
}

function buttonSprings() {
  const buttons = $$('.download-buttons .btn');
  const enter = e => animate(e.currentTarget, { scale: 1.05, ease: spring({ bounce: 0.5, duration: 400 }) });
  const leave = e => animate(e.currentTarget, { scale: 1, ease: spring({ bounce: 0.3, duration: 400 }) });
  buttons.forEach(b => { b.addEventListener('mouseenter', enter); b.addEventListener('mouseleave', leave); });
  return () => buttons.forEach(b => { b.removeEventListener('mouseenter', enter); b.removeEventListener('mouseleave', leave); });
}

// ── Downloads: point the main button at this visitor's platform ──
async function setupDownloads() {
  const platform = await detectPlatform();
  const labels = { 'mac-arm64': 'macOS (Apple Silicon)', 'mac-x64': 'macOS (Intel)', 'win-x64': 'Windows' };
  const files = { 'mac-arm64': 'CR8-mac-arm64.dmg', 'mac-x64': 'CR8-mac-x64.dmg', 'win-x64': 'CR8-win-x64.exe' };
  if (!platform) {
    $('[data-download-alt]').textContent = 'Available for macOS and Windows.';
    return;
  }
  const primary = $('[data-download-primary]');
  primary.href = `${RELEASES}/${files[platform]}`;
  primary.textContent = `Download for ${labels[platform]}`;
  const others = Object.keys(labels).filter(p => p !== platform);
  const alt = $('[data-download-alt]');
  alt.textContent = 'Also for ';
  others.forEach((p, i) => {
    const a = document.createElement('a');
    a.href = `${RELEASES}/${files[p]}`;
    a.textContent = labels[p];
    alt.append(a, i < others.length - 1 ? ' · ' : '');
  });
}

async function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'win-x64';
  if (!/Mac OS X|Macintosh/i.test(ua) || /iPhone|iPad/i.test(ua)) return null;
  try {
    const { architecture } = await navigator.userAgentData?.getHighEntropyValues(['architecture']) ?? {};
    if (architecture === 'x86') return 'mac-x64';
  } catch { /* not available (Safari, Firefox) */ }
  return 'mac-arm64'; // most current Macs
}

// ── Start (after all module-level constants are initialised) ──
$('#hero-record').innerHTML = heroSvgMarkup();
buildCamelotWheel($('#camelot-wheel'));
buildCrate($('#crate'));
setupDownloads();

createCr8Scope(document.body, ({ reduceMotion, mobile, finePointer }) => {
  const cleanups = [mountHero($('#hero-record'), { reduceMotion })];

  if (reduceMotion) {
    // Final states only; interactive bits still work without movement.
    cleanups.push(camelotHover());
    $('.crate-viewport').style.overflowX = 'auto';
    return () => cleanups.forEach(fn => fn());
  }

  heroIntro();
  nowPlaying();
  if (finePointer && !mobile) cleanups.push(parallax());
  features();
  cleanups.push(camelot());
  if (!mobile) crateDrag(); else $('.crate-viewport').style.overflowX = 'auto';
  revealSleeves();
  howItWorks();
  finalCta();
  cleanups.push(buttonSprings());

  return () => cleanups.forEach(fn => fn());
});

faqAccordion();
