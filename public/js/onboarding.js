import { api } from './api.js';
import { byId } from './dom.js';
import { mountTokenForm } from './components/tokenForm.js';
import { renderTokenTutorial } from './components/tokenTutorial.js';
import { createCr8Scope, prefersReducedMotion } from '/shared/motion/scope.js';
import { heroSvgMarkup, mountHero } from '/shared/motion/hero.js';
import { createLayout, animate } from '/vendor/anime/anime.esm.min.js';

const STEPS = ['welcome', 'profile', 'connect', 'done'];
const USERNAME = /^[A-Za-z0-9._-]{1,64}$/;

let me = null;
let current = null;
const layout = createLayout('.ob-steps', {
  children: '.ob-step',
  duration: 480,
  ease: 'out(4)',
  enterFrom: { opacity: 0, y: 24 },
  leaveTo: { opacity: 0, y: -24 },
});

function show(step) {
  if (step === current) return;
  const apply = () => {
    document.querySelectorAll('.ob-step').forEach(s => { s.hidden = s.dataset.step !== step; });
    document.querySelectorAll('.ob-progress li').forEach(li => {
      const i = STEPS.indexOf(li.dataset.for);
      li.classList.toggle('done', i < STEPS.indexOf(step));
      li.classList.toggle('current', li.dataset.for === step);
    });
  };
  if (current === null || prefersReducedMotion()) apply();
  else layout.update(apply);
  current = step;
  ENTER[step]?.();
  // Steps with a form focus their first field instead.
  if (step === 'welcome' || step === 'done') document.querySelector(`.ob-step[data-step="${step}"] h1`)?.focus();
}

const ENTER = {
  profile() {
    byId('first-name').value = me.firstName || '';
    byId('discogs-username').value = me.discogsUsername || '';
    if (me.discogsUsername) checkUsername();
    setTimeout(() => byId(me.discogsUsername ? 'first-name' : 'discogs-username').focus(), 50);
  },
  connect() {
    byId('connect-username').textContent = `@${me.discogsUsername}`;
    renderTokenTutorial(byId('tutorial'), { username: me.discogsUsername, open: true });
    mountTokenForm(byId('token-form'), {
      onSuccess: updated => { me = updated; setTimeout(() => show('done'), 500); },
    }).focus();
  },
  done() {
    byId('done-name').textContent = me.firstName ? `, ${me.firstName}` : '';
  },
};

// ── Profile step: live username check ────────────────────
let checkTimer = null;
let lastChecked = { name: '', exists: false };

function setUsernameState(state, message) {
  byId('username-state').dataset.state = state;
  byId('username-state').textContent = { ok: '✓', bad: '✕', busy: '…', '': '' }[state];
  const hint = byId('username-hint');
  hint.className = 'form-status' + (state === 'bad' ? ' error' : '');
  if (message) hint.textContent = message;
}

async function checkUsername() {
  const name = byId('discogs-username').value.trim();
  if (!name) return setUsernameState('', '');
  if (!USERNAME.test(name)) return setUsernameState('bad', 'Usernames use letters, numbers, dots, dashes and underscores.');
  setUsernameState('busy', 'Looking for that account on Discogs…');
  try {
    const { exists } = await api(`/api/account/username-check?${new URLSearchParams({ u: name })}`);
    if (byId('discogs-username').value.trim() !== name) return; // typed on
    lastChecked = { name, exists };
    setUsernameState(exists ? 'ok' : 'bad', exists ? `Found @${name} on Discogs.` : `No Discogs account named "${name}".`);
  } catch (e) {
    setUsernameState('', e.message);
  }
}

function shake(el) {
  if (!prefersReducedMotion()) animate(el, { x: [0, -6, 6, -4, 4, 0], duration: 360, ease: 'inOut(2)' });
}

async function submitProfile(e) {
  e.preventDefault();
  const input = byId('discogs-username');
  const name = input.value.trim();
  if (!USERNAME.test(name) || (lastChecked.name === name && !lastChecked.exists)) {
    shake(input);
    await checkUsername();
    return input.focus();
  }
  const button = e.submitter;
  button.disabled = true;
  try {
    me = await api('/api/account/profile', {
      method: 'PUT',
      body: { firstName: byId('first-name').value.trim(), discogsUsername: name },
    });
    show(me.onboarded ? 'done' : 'connect');
  } catch (err) {
    setUsernameState('bad', err.message);
    shake(input);
  } finally {
    button.disabled = false;
  }
}

async function init() {
  me = await api('/api/me');
  if (me.onboarded) { location.href = '/'; return; }

  const hero = byId('ob-hero');
  hero.innerHTML = heroSvgMarkup();
  createCr8Scope(document.body, ({ reduceMotion }) => mountHero(hero, { reduceMotion }));

  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]')?.dataset.go;
    if (go) show(go);
  });
  byId('discogs-username').addEventListener('input', () => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(checkUsername, 450);
  });
  byId('profile-form').addEventListener('submit', submitProfile);
  byId('open-app').addEventListener('click', () => { location.href = '/'; });

  show(me.discogsUsername ? 'connect' : 'welcome');
}

init().catch(e => {
  const banner = document.createElement('div');
  banner.className = 'app-banner error';
  banner.innerHTML = '<div></div>';
  banner.firstChild.textContent = `CR8 couldn't start: ${e.message}`;
  document.body.prepend(banner);
});
