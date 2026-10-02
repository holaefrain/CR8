// Escapes text for HTML element content *and* quoted attribute values.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

export const byId = id => document.getElementById(id);

// Only http(s) links may be rendered into href attributes.
export const safeUrl = u => (/^https?:\/\//i.test(String(u || '')) ? esc(u) : '#');

export function setStatus(el, text, { loading = false } = {}) {
  el.className = 'status-line' + (loading ? ' loading' : '');
  el.textContent = text;
}

// Routes clicks on [data-action] elements inside `root` to handlers.
export function onAction(root, handlers) {
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const handler = handlers[el.dataset.action];
    if (handler) { e.preventDefault(); handler(el, e); }
  });
}
