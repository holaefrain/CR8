import { createScope } from '/vendor/anime/anime.esm.min.js';

export const MEDIA_QUERIES = Object.freeze({
  reduceMotion: '(prefers-reduced-motion: reduce)',
  mobile: '(max-width: 720px)',
  finePointer: '(pointer: fine)',
});

// The one way CR8 surfaces set up motion. `fn(matches, scope)` runs inside an
// anime.js Scope; when a media query flips (reduced motion toggled, window
// resized past the breakpoint) the scope reverts every animation it created
// and runs `fn` again. `fn` may return a cleanup function.
export function createCr8Scope(root, fn) {
  return createScope({ root, mediaQueries: MEDIA_QUERIES }).add(self => fn(self.matches, self));
}

export const prefersReducedMotion = () => window.matchMedia(MEDIA_QUERIES.reduceMotion).matches;
