// Pure label layout: DYMO roll catalogue, how tracks split across labels,
// and the DYMO Connect label XML. No DOM access — the Export tab passes in
// the user's settings.

export const PREVIEW_SCALE = 2.4; // px per mm for preview

// Every LabelWriter roll sold on dymo.com (as of Oct 2026). `name` is the
// DieCutSKU/ContSKU name from the SKU catalog embedded in DYMO Connect
// (DYMO.LabelAPI.dll), used as <LabelName> in the label XML. w × h is the
// printable label in mm; for multi-up or shaped rolls it's a single label /
// the printable panel. `also` lists SKUs that ship the same roll (value packs,
// clear/durable variants) so roll auto-detection finds them.
export const DYMO_LABELS = [
  { sku: '30252',   name: 'Address', w: 28,   h: 89,    desc: 'Address — 1⅛″ × 3½″', also: ['30254'] },
  { sku: '30321',   name: 'LargeAddress', w: 36,   h: 89,    desc: 'Large Address — 1⅖″ × 3½″' },
  { sku: '30330',   name: 'ReturnAddress30330', w: 19,   h: 51,    desc: 'Return Address — ¾″ × 2″' },
  { sku: '30323',   name: 'Shipping', w: 54,   h: 102,   desc: 'Shipping — 2⅛″ × 4″' },
  { sku: '30256',   name: 'LargeShipping', w: 59,   h: 102,   desc: 'Large Shipping — 2⁵⁄₁₆″ × 4″', also: ['1763982', '2050765'] },
  { sku: '1744907', name: 'Shipping4x6 1744907', w: 104,  h: 159,   desc: 'Extra Large Shipping — 4″ × 6″', wide: true },
  { sku: '30336',   name: 'Small30336', w: 25,   h: 54,    desc: 'Multi-Purpose — 1″ × 2⅛″', also: ['2050764'] },
  { sku: '30332',   name: 'Small30332', w: 25,   h: 25,    desc: 'Multi-Purpose — 1″ × 1″', also: ['1933083'] },
  { sku: '30333',   name: 'Small30333', w: 12.7, h: 25.4,  desc: 'Multi-Purpose 2-up — ½″ × 1″' },
  { sku: '30324',   name: 'Storage30324', w: 54,   h: 70,    desc: 'Large Multi-Purpose — 2⅛″ × 2¾″' },
  { sku: '30370',   name: 'ZipDisk', w: 51,   h: 59,    desc: 'Removable Multi-Purpose — 2″ × 2⁵⁄₁₆″' },
  { sku: '1738595', name: '1738595 DYMO Barcode', w: 19,   h: 64,    desc: 'Barcode — ¾″ × 2½″' },
  { sku: '30327',   name: 'FileFolder', w: 14,   h: 87,    desc: 'File Folder — ⁹⁄₁₆″ × 3⁷⁄₁₆″', also: ['2050812'] },
  { sku: '30326',   name: 'Prescription', w: 46,   h: 78,    desc: 'Video Top — 1⅘″ × 3⅒″' },
  { sku: '30374',   name: 'Appointment', w: 51,   h: 89,    desc: 'Business Card, non-adhesive — 2″ × 3½″' },
  { sku: '1760756', name: 'NameBadgeCard 1760756', w: 58.8, h: 101.6, desc: 'Name Badge — 2¼″ × 4″', also: ['30911'] },
  { sku: '30856',   name: 'NameBadgeCard', w: 61.9, h: 105.8, desc: 'Name Badge, non-adhesive — 2⁷⁄₁₆″ × 4³⁄₁₆″' },
  { sku: '30373',   name: 'PriceTag', w: 23.8, h: 23.8,  desc: 'Price Tag — ⅞″ × ¹⁵⁄₁₆″' },
  { sku: '30299',   name: 'Jewelry30299', w: 19,   h: 11,    desc: 'Jewelry 2-up — ⅜″ × ¾″' },
  { sku: '30270',   name: '30270 Continuous', w: 56,   h: 101,   desc: 'Continuous — 2¼″ wide, cut at 101 mm', continuous: true },
];

export const findLabel = sku => DYMO_LABELS.find(l => l.sku === sku) || null;

// Group tracks by album, keeping first-seen order.
export function groupAlbums(tracks) {
  const albums = [];
  const seen = new Map();
  for (const t of tracks) {
    const key = t.artist + '||' + t.album;
    if (!seen.has(key)) { seen.set(key, []); albums.push({ info: t, tracks: seen.get(key) }); }
    seen.get(key).push(t);
  }
  return albums;
}

export function getLabelLayout(wMm, hMm) {
  // Max tracks per label before splitting to a new label
  let maxTracks;
  if      (hMm >= 140)              maxTracks = 6;  // 104×159
  else if (hMm >= 100 && wMm >= 50) maxTracks = 4;  // 54×102, 59×102
  else if (hMm >= 85)               maxTracks = 3;  // 28×89
  else if (hMm >= 45)               maxTracks = 2;  // 54×70, 25×54, 19×51
  else                              maxTracks = 1;  // 25×25

  // Show per-track BPM/key/duration sub-line only when there's width for it
  const showMeta = wMm >= 25;

  // Base print font sizes (pt) — scaled to fill the label by getLabelFontSizes
  let fonts;
  if (wMm >= 50) {
    fonts = { artist: 13, album: 11, divider: 9, title: 9, meta: 8, footer: 8 };
  } else if (wMm >= 25) {
    fonts = { artist: 11, album: 10, divider: 8, title: 8, meta: 7, footer: 7 };
  } else {
    fonts = { artist: 9, album: 8, divider: 7, title: 7, meta: 6, footer: 6 };
  }

  return { maxTracks, showMeta, fonts };
}

// Split one album's tracks into labels per the "Split" setting. Returns
// [{ tracks, part }] where `part` is the suffix shown after the album name.
//   auto  — as many tracks as fit the label size (maxTracks)
//   count — a user-chosen number of tracks per label
//   side  — one label per vinyl side, from the position letter (A1 → A)
export function splitAlbumTracks(tracks, maxTracks, { mode = 'auto', perLabel } = {}) {

  if (mode === 'side') {
    const sides = new Map();
    for (const t of tracks) {
      const side = (String(t.position || '').trim().match(/^[A-Za-z]+/)?.[0] || '').toUpperCase();
      if (!sides.has(side)) sides.set(side, []);
      sides.get(side).push(t);
    }
    if (sides.size > 1 || !sides.has('')) {
      return [...sides].map(([side, sideTracks]) => ({
        tracks: sideTracks,
        part: side ? `(Side ${side})` : ''
      }));
    }
    // No side letters in the positions (e.g. "1", "2") — fall back to fitting the label
  }

  const per = mode === 'count' ? Math.max(1, parseInt(perLabel, 10) || maxTracks) : maxTracks;
  const chunks = [];
  for (let i = 0; i < tracks.length; i += per) chunks.push(tracks.slice(i, i + per));
  return chunks.map((chunk, ci) => ({
    tracks: chunk,
    part: chunks.length > 1 ? `(${ci + 1}/${chunks.length})` : ''
  }));
}

// Print margins (mm). The large top margin keeps text clear of the
// LabelWriter's unprintable leading edge.
function getLabelPadding(wMm, hMm) {
  const min = Math.min(wMm, hMm);
  return { side: Math.max(1, min * 0.02), top: Math.max(9, min * 0.05), bottom: Math.max(1, min * 0.02) };
}

// Scale the base point sizes so the lines fill the label's printable height
function getLabelFontSizes(wMm, hMm, lineDefs, fonts) {
  const MM_TO_PT = 72 / 25.4;
  const { top, bottom } = getLabelPadding(wMm, hMm);
  const innerHeight = Math.max(1, hMm - top - bottom);
  const typeFactor = { artist: 1.35, album: 1.2, divider: 0.9, title: 1.15, meta: 1.0, footer: 1.05 };

  const totalHeight = lineDefs.reduce((sum, line) =>
    sum + (fonts[line.type] || fonts.title) * (typeFactor[line.type] || 1), 0);

  const scale = Math.min(2.5, Math.max(0.65, (innerHeight * MM_TO_PT) / Math.max(totalHeight, 1)));
  return {
    artist:  Math.max(6, Math.round(fonts.artist  * scale)),
    album:   Math.max(6, Math.round(fonts.album   * scale)),
    divider: Math.max(5, Math.round(fonts.divider * scale)),
    title:   Math.max(6, Math.round(fonts.title   * scale)),
    meta:    Math.max(5, Math.round(fonts.meta    * scale)),
    footer:  Math.max(5, Math.round(fonts.footer  * scale))
  };
}

// DYMO Connect label format:
// https://labelwriter.com/software/dymo-connect/label-xml-specification/#label-format-specification
export function buildLabelXml(info, tracks, partLabel, label) {
  const { w: wMm, h: hMm } = label;
  const toIn = mm => +(mm / 25.4).toFixed(6);
  const wIn = toIn(wMm), hIn = toIn(hMm);
  const padMm = getLabelPadding(wMm, hMm);
  const sidePadIn = toIn(padMm.side), topPadIn = toIn(padMm.top), bottomPadIn = toIn(padMm.bottom);

  const { fonts, showMeta } = getLabelLayout(wMm, hMm);

  const xmlEsc = s => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const black = `<SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush>`;
  const transparent = `<SolidColorBrush><Color A="0" R="0" G="0" B="0"></Color></SolidColorBrush>`;

  const divider = '─'.repeat(wMm >= 50 ? 20 : wMm >= 26 ? 14 : 10);
  const albumLine = info.album + (partLabel ? ` ${partLabel}` : '');

  const lineDefs = [];
  lineDefs.push({ type: 'artist', text: info.artist, bold: true });
  lineDefs.push({ type: 'album', text: albumLine });
  lineDefs.push({ type: 'divider', text: divider });

  for (const t of tracks) {
    const pos = t.position ? `${t.position}. ` : '';
    lineDefs.push({ type: 'title', text: pos + t.title });
    if (showMeta) {
      const meta = [t.bpm ? `${t.bpm} BPM` : '', t.key || '', t.duration || ''].filter(Boolean).join(' · ');
      if (meta) lineDefs.push({ type: 'meta', text: meta });
    }
  }

  lineDefs.push({ type: 'divider', text: divider });
  const yearGenre = [info.year, info.genre].filter(Boolean).join(' · ');
  if (yearGenre) lineDefs.push({ type: 'footer', text: yearGenre });
  if (info.label) lineDefs.push({ type: 'footer', text: info.label });

  const sizes = getLabelFontSizes(wMm, hMm, lineDefs, fonts);

  // Pre-wrap long lines on word boundaries so AlwaysFit doesn't shrink the whole label
  const wrapText = (text, size) => {
    const usableMm = Math.max(1, wMm - padMm.side * 2);
    const avgCharMm = Math.max(0.9, size * 0.16);
    const maxChars = Math.max(10, Math.floor(usableMm / avgCharMm));
    const lines = [];
    let current = '';
    for (const word of String(text || '').split(' ')) {
      if (!current) { current = word; continue; }
      const next = `${current} ${word}`;
      if (next.length <= maxChars) { current = next; continue; }
      lines.push(current);
      current = word;
      while (current.length > maxChars) {
        lines.push(current.slice(0, maxChars));
        current = current.slice(maxChars);
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  };

  const span = (text, size, bold = false) =>
    `<LineTextSpan><TextSpan><Text>${xmlEsc(text)}</Text>` +
    `<FontInfo><FontName>Arial</FontName><FontSize>${size}</FontSize>` +
    `<IsBold>${bold ? 'True' : 'False'}</IsBold><IsItalic>False</IsItalic>` +
    `<IsUnderline>False</IsUnderline><FontBrush>${black}</FontBrush>` +
    `</FontInfo></TextSpan></LineTextSpan>`;

  const lines = lineDefs.flatMap(def => {
    const size = sizes[def.type] || sizes.title;
    if (def.type === 'divider') return [span(def.text, size, def.bold)];
    return wrapText(def.text, size).map(line => span(line, size, def.bold));
  });

  const tX = sidePadIn, tY = topPadIn;
  const tW = +(wIn - sidePadIn * 2).toFixed(6), tH = +(hIn - topPadIn - bottomPadIn).toFixed(6);

  const inner = `<DYMOLabel Version="3">` +
    `<Description>DYMO Label</Description><Orientation>Portrait</Orientation>` +
    `<LabelName>${xmlEsc(label.name)}</LabelName><InitialLength>0</InitialLength>` +
    `<BorderStyle>SolidLine</BorderStyle>` +
    `<DYMORect><DYMOPoint><X>0</X><Y>0</Y></DYMOPoint><Size><Width>${wIn}</Width><Height>${hIn}</Height></Size></DYMORect>` +
    `<BorderColor>${black}</BorderColor><BorderThickness>0</BorderThickness><Show_Border>False</Show_Border>` +
    `<DynamicLayoutManager><RotationBehavior>ClearObjects</RotationBehavior><LabelObjects>` +
    `<TextObject><Name>Text</Name>` +
    `<Brushes><BackgroundBrush>${transparent}</BackgroundBrush><BorderBrush>${black}</BorderBrush>` +
    `<StrokeBrush>${black}</StrokeBrush><FillBrush>${transparent}</FillBrush></Brushes>` +
    `<Rotation>Rotation0</Rotation><OutlineThickness>0</OutlineThickness><IsOutlined>False</IsOutlined>` +
    `<BorderStyle>SolidLine</BorderStyle>` +
    `<Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin>` +
    `<HorizontalAlignment>Left</HorizontalAlignment><VerticalAlignment>Top</VerticalAlignment>` +
    `<FitMode>AlwaysFit</FitMode><IsVertical>False</IsVertical>` +
    `<FormattedText><FitMode>AlwaysFit</FitMode><HorizontalAlignment>Left</HorizontalAlignment>` +
    `<VerticalAlignment>Top</VerticalAlignment><IsVertical>False</IsVertical>` +
    `${lines.join('')}</FormattedText>` +
    `<ObjectLayout><DYMOPoint><X>${tX}</X><Y>${tY}</Y></DYMOPoint>` +
    `<Size><Width>${tW}</Width><Height>${tH}</Height></Size></ObjectLayout>` +
    `</TextObject></LabelObjects></DynamicLayoutManager></DYMOLabel>`;

  return `<?xml version="1.0" encoding="utf-8"?><DesktopLabel Version="1">${inner}` +
    `<LabelApplication>Blank</LabelApplication>` +
    `<DataTable><Columns></Columns><Rows></Rows></DataTable></DesktopLabel>`;
}
