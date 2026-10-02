import { esc, safeUrl } from '../dom.js';
import { addAlbum } from './albumAdder.js';

// Markup for a release card (search results, wantlist, Discogs collection).
// `meta` is pre-escaped HTML for the third line; `tag` is optional HTML.
export function releaseCardHtml(r, { meta, tag }) {
  const thumb = r.thumb
    ? `<img class="rc-thumb" src="${safeUrl(r.thumb)}" alt="" loading="lazy" />`
    : `<div class="rc-thumb-placeholder">♪</div>`;
  return `
    <div class="rc-left">
      ${thumb}
      <div class="rc-info">
        <div class="rc-title">${esc(r.artist)} — ${esc(r.album)} <span style="font-weight:300;color:var(--muted)">(${esc(r.year || '—')})</span></div>
        <div class="rc-meta">${esc(r.genre || '')}${r.label ? ' · ' + esc(r.label) : ''}</div>
        <div class="rc-tracks">${meta}</div>
      </div>
    </div>
    <div class="rc-right">
      ${r.discogsUrl ? `<a class="rc-discogs-link" href="${safeUrl(r.discogsUrl)}" target="_blank" rel="noopener">↗ Discogs</a>` : ''}
      ${tag || ''}
    </div>`;
}

// Click-to-add behaviour shared by search results and the wantlist: marks
// the card, adds the release and shows enrichment progress on its tag.
export async function addFromCard(release, card) {
  if (card.classList.contains('added')) return;
  const tag = card.querySelector('.tag');
  tag.textContent = '⟳ Enriching…';
  tag.className = 'tag enriching';
  card.classList.add('added');
  await addAlbum(release);
  tag.textContent = '✓ Added';
  tag.className = 'tag added';
}
