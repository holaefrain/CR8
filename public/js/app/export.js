import { esc, byId, onAction } from '../dom.js';
import * as store from './collectionStore.js';
import * as dymo from './dymo.js';
import {
  DYMO_LABELS, PREVIEW_SCALE, findLabel, groupAlbums, getLabelLayout, splitAlbumTracks, buildLabelXml,
} from './labels.js';

let detectedPrinter = null;

const MODEL_MAP = [
  ['550 turbo', 'LabelWriter 550 Turbo'],
  ['550',       'LabelWriter 550'],
  ['450 turbo', 'LabelWriter 450 Turbo'],
  ['5xl',       'LabelWriter 5XL'],
  ['4xl',       'LabelWriter 4XL'],
  ['wireless',  'LabelWriter Wireless'],
  ['450',       'LabelWriter 450'],
];

export function initExport() {
  const sizeSelect = byId('dymo-size');
  sizeSelect.innerHTML = DYMO_LABELS.map(l =>
    `<option value="${esc(l.sku)}">${esc(l.sku)} — ${esc(l.desc)}${l.wide ? ' (4XL/5XL)' : ''}</option>`,
  ).join('') + '<option value="custom">Custom… (preview only)</option>';
  sizeSelect.value = '30323';

  const root = byId('tab-export');
  root.querySelectorAll('[data-label-setting]').forEach(el => {
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', updateLabelSettings);
  });
  onAction(root, {
    'dymo-detect': detectPrinter,
    'dymo-print': printLabels,
    'export-xlsx': exportXLSX,
    'export-csv': exportCSV,
  });
  store.subscribe(({ type }) => {
    if (type !== 'edit' && root.classList.contains('active')) renderPreview();
  });
}

export function onShow() {
  updateLabelSettings();
  detectPrinter();
}

// ── Settings ─────────────────────────────────────────────
const selectedLabel = () => findLabel(byId('dymo-size')?.value || '30323'); // null = custom

function labelDimensions() {
  const label = selectedLabel();
  if (label) return { w: label.w, h: label.h };
  return {
    w: parseFloat(byId('custom-w')?.value) || 54,
    h: parseFloat(byId('custom-h')?.value) || 101,
  };
}

const splitSettings = () => ({ mode: byId('dymo-split')?.value || 'auto', perLabel: byId('dymo-split-count')?.value });

function updateLabelSettings() {
  byId('custom-size-row').style.display = byId('dymo-size').value === 'custom' ? '' : 'none';
  byId('dymo-split-count').style.display = byId('dymo-split').value === 'count' ? '' : 'none';
  const model = byId('dymo-model')?.value || 'LabelWriter 450';
  const { w, h } = labelDimensions();
  const sizeSelect = byId('dymo-size');
  const sizeText = sizeSelect?.options[sizeSelect.selectedIndex]?.text || '';
  byId('preview-label-text').textContent = `Label preview — DYMO ${model} · ${sizeText || `${w} × ${h} mm`}`;
  renderPreview();
}

// ── Preview ──────────────────────────────────────────────
function renderPreview() {
  const prev = byId('label-preview');
  const tracks = store.all();
  if (!tracks.length) {
    prev.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">Add tracks to see label preview</div>';
    return;
  }

  const { w, h } = labelDimensions();
  const { maxTracks, showMeta } = getLabelLayout(w, h);
  const pw = Math.round(w * PREVIEW_SCALE), ph = Math.round(h * PREVIEW_SCALE);
  const baseFontScale = Math.min(w, h) / 54;

  const labels = groupAlbums(tracks).flatMap(({ info: a, tracks: albumTracks }) =>
    splitAlbumTracks(albumTracks, maxTracks, splitSettings()).map(({ tracks: chunk, part }) => `
      <div class="dymo-label" style="width:${pw}px;height:${ph}px;padding:${Math.round(ph * 0.05)}px ${Math.round(pw * 0.07)}px">
        <div class="dl-artist" style="font-size:${Math.round(13 * baseFontScale)}px">${esc(a.artist)}</div>
        <div class="dl-album">${esc(a.album)}${part ? ` <span style="font-weight:300">${esc(part)}</span>` : ''}</div>
        <div class="dl-divider"></div>
        <div class="dl-tracklist">
          ${chunk.map(t => {
            const meta = [t.bpm ? `${t.bpm} BPM` : '', t.key || '', t.duration || ''].filter(Boolean).join(' · ');
            return `<div class="dl-track-row">
              <div class="dl-track-title">
                ${t.position ? `<span class="dl-pos">${esc(t.position)}</span>` : ''}
                <span class="dl-track">${esc(t.title)}</span>
              </div>
              ${showMeta && meta ? `<div class="dl-track-meta">${esc(meta)}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="dl-divider"></div>
        <div class="dl-meta">
          <span>${esc(a.year)}${a.genre ? ' · ' + esc(a.genre) : ''}</span>
          <span>${esc(a.label)}</span>
        </div>
      </div>`));

  prev.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center">${labels.join('')}</div>`;
}

// ── DYMO printer ─────────────────────────────────────────
function setPrinterStatus(html) { byId('dymo-printer-status').innerHTML = html; }

async function detectPrinter() {
  const printBtn = byId('btn-dymo-print');
  detectedPrinter = null;
  printBtn.disabled = true;
  setPrinterStatus('<span style="color:var(--amber)">detecting…</span>');

  if (!(await dymo.isServiceRunning())) {
    setPrinterStatus('DYMO service unreachable — open DYMO Connect, or <a href="https://www.dymo.com/software.html" target="_blank" rel="noopener" style="color:var(--amber)">install it</a>');
    return;
  }

  let printers;
  try {
    printers = await dymo.listLabelWriters();
  } catch (e) {
    setPrinterStatus('Could not query printers: ' + esc(e.message));
    return;
  }

  const available = printers.filter(p => p.connected);
  if (!available.length) {
    setPrinterStatus(printers.length
      ? 'LabelWriter found but reporting disconnected'
      : 'No LabelWriter registered — add it in System Settings → Printers & Scanners');
    return;
  }
  detectedPrinter = available[0];

  // Match the detected model to the dropdown
  const modelSelect = byId('dymo-model');
  const detected = (detectedPrinter.modelName || detectedPrinter.name || '').toLowerCase();
  const optText = MODEL_MAP.find(([fragment]) => detected.includes(fragment))?.[1];
  const option = [...modelSelect.options].find(o => o.text === optText);
  if (option) modelSelect.value = option.value;

  let roll = null;
  if (detected.includes('550')) roll = await dymo.detectRoll(detectedPrinter.name).catch(() => null);
  if (roll) byId('dymo-size').value = roll.label.sku;

  updateLabelSettings();
  setPrinterStatus(`<span style="color:var(--green)">●</span> ${esc(detectedPrinter.name)}${roll ? ` · roll ${esc(roll.part)}` : ' — ready'}`);
  printBtn.disabled = false;
}

async function printLabels() {
  if (!detectedPrinter) return alert('No printer detected. Click ↺ Detect first.');
  const tracks = store.all();
  if (!tracks.length) return alert('No tracks to print.');

  const label = selectedLabel();
  if (!label) return alert('Custom sizes are preview-only. Pick a DYMO label roll to print.');
  const printerModel = (detectedPrinter.modelName || detectedPrinter.name).toLowerCase();
  if (label.wide && !/[45]xl/.test(printerModel)) {
    return alert(`${label.sku} labels are 4″ wide and need a LabelWriter 4XL or 5XL.`);
  }

  const { maxTracks } = getLabelLayout(label.w, label.h);
  const statusEl = byId('dymo-print-status');
  statusEl.textContent = 'Printing…';
  let count = 0;
  try {
    for (const { info, tracks: albumTracks } of groupAlbums(tracks)) {
      for (const { tracks: chunk, part } of splitAlbumTracks(albumTracks, maxTracks, splitSettings())) {
        await dymo.printLabel(detectedPrinter.name, buildLabelXml(info, chunk, part, label));
        count++;
      }
    }
    statusEl.textContent = `Sent ${count} label${count !== 1 ? 's' : ''} to ${detectedPrinter.name}`;
    setTimeout(() => { statusEl.textContent = ''; }, 5000);
  } catch (e) {
    statusEl.textContent = 'Print failed: ' + e.message;
  }
}

// ── Files ────────────────────────────────────────────────
function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let excelLoading = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  excelLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/exceljs/exceljs.min.js';
    s.onload = () => resolve(window.ExcelJS);
    s.onerror = () => { excelLoading = null; reject(new Error('Excel library failed to load')); };
    document.head.appendChild(s);
  });
  return excelLoading;
}

async function exportXLSX() {
  const tracks = store.all();
  if (!tracks.length) return alert('No tracks to export.');
  let ExcelJS;
  try { ExcelJS = await loadExcelJS(); } catch (e) { return alert(e.message); }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CR8';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Vinyl Collection');
  worksheet.columns = [
    { header: 'Artist', key: 'artist', width: 22 },
    { header: 'Album', key: 'album', width: 26 },
    { header: 'Track Title', key: 'title', width: 32 },
    { header: 'Year', key: 'year', width: 7 },
    { header: 'Genre', key: 'genre', width: 14 },
    { header: 'Label', key: 'label', width: 22 },
    { header: 'Position', key: 'position', width: 7 },
    { header: 'Duration', key: 'duration', width: 10 },
    { header: 'BPM', key: 'bpm', width: 7 },
    { header: 'Key', key: 'key', width: 12 },
  ];
  worksheet.addRows(tracks.map(({ artist, album, title, year, genre, label, position, duration, bpm, key }) =>
    ({ artist, album, title, year, genre, label, position, duration, bpm, key })));

  const buffer = await workbook.xlsx.writeBuffer();
  download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'vinyl_collection.xlsx');
}

function exportCSV() {
  const tracks = store.all();
  if (!tracks.length) return alert('No tracks to export.');
  const headers = ['Artist', 'Album', 'Track Title', 'Year', 'Genre', 'Label', 'Position', 'Duration', 'BPM', 'Key'];
  // Prefix cells that start with = + - @ so spreadsheet apps don't run them as formulas.
  const cell = v => {
    const s = String(v ?? '');
    return '"' + (/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""') + '"';
  };
  const rows = tracks.map(t =>
    [t.artist, t.album, t.title, t.year, t.genre, t.label, t.position, t.duration, t.bpm, t.key].map(cell).join(','));
  download(new Blob([[headers.join(','), ...rows].join('\r\n')], { type: 'text/csv' }), 'dymo_vinyl_labels.csv');
}
