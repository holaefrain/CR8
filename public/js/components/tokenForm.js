import { api, ErrorCodes } from '../api.js';
import { animate, svg } from '/vendor/anime/anime.esm.min.js';
import { prefersReducedMotion } from '/shared/motion/scope.js';

// Token field + "Verify & save". The server checks the token with Discogs
// and that it belongs to the profile's username before storing it.
export function mountTokenForm(el, { onSuccess, submitLabel = 'Verify & save' } = {}) {
  el.innerHTML = `
    <form class="token-form" novalidate>
      <label class="field-label" for="token-input">Personal access token</label>
      <div class="token-input-row">
        <input id="token-input" type="password" autocomplete="off" spellcheck="false"
               placeholder="Paste your Discogs token" aria-describedby="token-status" />
        <button type="button" class="btn" data-role="reveal" aria-label="Show token">Show</button>
        <button type="submit" class="btn primary">${submitLabel}</button>
        <svg class="token-check" viewBox="0 0 24 24" aria-hidden="true" hidden><path d="M4 12.5l5 5L20 6.5" /></svg>
      </div>
      <div class="form-status" id="token-status" role="status"></div>
    </form>`;

  const form = el.querySelector('form');
  const input = form.querySelector('input');
  const submit = form.querySelector('[type=submit]');
  const status = form.querySelector('.form-status');
  const check = form.querySelector('.token-check');

  form.querySelector('[data-role=reveal]').addEventListener('click', e => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Hide' : 'Show';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const token = input.value.trim();
    if (!token) return fail('Paste your token first.');
    submit.disabled = true;
    check.hidden = true;
    status.className = 'form-status';
    status.textContent = 'Checking with Discogs…';
    try {
      const me = await api('/api/account/discogs-token', { method: 'PUT', body: { token } });
      input.value = '';
      status.textContent = `Connected as @${me.discogsUsername}.`;
      await drawCheck();
      onSuccess?.(me);
    } catch (err) {
      fail(err.code === ErrorCodes.DISCOGS_THROTTLED
        ? 'Discogs is busy — try again in a minute.'
        : err.message);
    } finally {
      submit.disabled = false;
    }
  });

  function fail(message) {
    status.className = 'form-status error';
    status.textContent = message;
    if (!prefersReducedMotion()) animate(input, { x: [0, -6, 6, -4, 4, 0], duration: 360, ease: 'inOut(2)' });
    input.focus();
  }

  async function drawCheck() {
    check.hidden = false;
    if (prefersReducedMotion()) return;
    await animate(svg.createDrawable(check.querySelector('path')), { draw: ['0 0', '0 1'], duration: 450, ease: 'out(3)' });
  }

  return { focus: () => input.focus() };
}
