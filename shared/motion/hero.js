import { createTimeline, svg, stagger, spring, waapi, utils } from '/vendor/anime/anime.esm.min.js';

const GROOVES = [92, 84, 77, 70, 63, 56, 49];

// The record + tonearm illustration. Decorative, so it's rendered by script
// (pages stay fully readable without JS) and hidden from screen readers.
export function heroSvgMarkup() {
  return `
  <svg class="hero-svg" viewBox="0 0 260 220" aria-hidden="true" focusable="false">
    <g class="hero-disc">
      <circle class="hero-vinyl" cx="110" cy="110" r="100" />
      ${GROOVES.map(r => `<circle class="hero-groove" cx="110" cy="110" r="${r}" />`).join('')}
      <circle class="hero-label" cx="110" cy="110" r="34" />
      <path class="hero-label-mark" d="M110 86 a24 24 0 0 1 24 24" />
      <circle class="hero-spindle" cx="110" cy="110" r="4" />
    </g>
    <g class="hero-tonearm">
      <circle class="hero-pivot" cx="226" cy="30" r="12" />
      <path class="hero-arm" d="M226 30 L214 150 L190 176" />
      <rect class="hero-headshell" x="176" y="168" width="22" height="14" rx="2" transform="rotate(-40 187 175)" />
    </g>
  </svg>`;
}

// Intro: grooves draw from the centre out, the label springs in, the
// tonearm swings onto the record; then the disc spins at 33⅓ RPM.
// Returns a cleanup function (for createCr8Scope).
export function mountHero(root, { reduceMotion }) {
  const disc = root.querySelector('.hero-disc');
  const label = root.querySelector('.hero-label');
  const arm = root.querySelector('.hero-tonearm');
  if (!disc) return () => {};

  if (reduceMotion) {
    utils.set(arm, { rotate: 0 });
    return () => {};
  }

  const tl = createTimeline({ defaults: { ease: 'out(3)' } })
    .add(svg.createDrawable(root.querySelectorAll('.hero-groove')), {
      draw: ['0 0', '0 1'], duration: 900, delay: stagger(45, { from: 'last' }),
    })
    .add(label, { scale: [0, 1], opacity: [0, 1], ease: spring({ bounce: 0.35, duration: 600 }) }, '-=600')
    .add(arm, { rotate: [-32, 0], ease: spring({ bounce: 0.25, duration: 900 }) }, '-=300');

  // 33⅓ RPM = one turn every 1.8 s. WAAPI keeps it on the compositor.
  const spin = waapi.animate(disc, { rotate: '1turn', duration: 1800, ease: 'linear', loop: true });

  return () => { tl.revert(); spin.revert(); };
}
