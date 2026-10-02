import { esc } from '../dom.js';
import { stagger, animate } from '/vendor/anime/anime.esm.min.js';
import { prefersReducedMotion } from '/shared/motion/scope.js';

const DEVELOPERS_URL = 'https://www.discogs.com/settings/developers';

// The single source for "how do I find my Discogs token?" — used in
// onboarding and in Discogs tab → Rotate token. Links open in the browser.
export function renderTokenTutorial(el, { username = '', open = true } = {}) {
  el.innerHTML = `
    <details class="tutorial" ${open ? 'open' : ''}>
      <summary>How do I find my Discogs token?</summary>
      <ol class="tutorial-steps">
        <li><span class="step-n">1</span><div>Sign in at <a href="https://www.discogs.com/login" target="_blank" rel="noopener">discogs.com</a>${username ? ` as <strong>@${esc(username)}</strong>` : ''}.</div></li>
        <li><span class="step-n">2</span><div>Click your avatar (top right) → <strong>Settings</strong>.</div></li>
        <li><span class="step-n">3</span><div>Open the <strong>Developers</strong> tab — or go straight to <a href="${DEVELOPERS_URL}" target="_blank" rel="noopener">discogs.com/settings/developers</a>.</div></li>
        <li><span class="step-n">4</span><div>Click <strong>Generate new token</strong>, then copy the long string that appears.</div></li>
        <li><span class="step-n">5</span><div>Paste it below and click <strong>Verify &amp; save</strong>.</div></li>
      </ol>
      <ul class="tutorial-notes">
        <li>Your token is encrypted with your computer's keychain and only ever sent to Discogs.</li>
        <li>Generating a new token on Discogs turns off the old one — update it in CR8 → Discogs tab → <em>Rotate token</em>.</li>
        ${username ? `<li>The token must belong to <strong>@${esc(username)}</strong>.</li>` : ''}
      </ul>
    </details>`;

  const details = el.querySelector('details');
  const reveal = () => {
    if (!details.open || prefersReducedMotion()) return;
    animate(details.querySelectorAll('.tutorial-steps li'), {
      opacity: [0, 1], x: [-12, 0], duration: 420, ease: 'out(3)', delay: stagger(70),
    });
  };
  details.addEventListener('toggle', reveal);
  reveal();
}
