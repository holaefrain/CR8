// ── Camelot wheel conversion ──────────────────────────────
const CAMELOT_MAP = {
  'C major': '8B',  'C minor': '5A',
  'C# major': '3B', 'C# minor': '12A',
  'Db major': '3B', 'Db minor': '12A',
  'D major': '10B', 'D minor': '7A',
  'D# major': '5B', 'D# minor': '2A',
  'Eb major': '5B', 'Eb minor': '2A',
  'Ab major': '4B', 'Ab minor': '1A',
  'E major': '12B', 'E minor': '9A',
  'F major': '7B',  'F minor': '4A',
  'F# major': '2B', 'F# minor': '11A',
  'Gb major': '2B', 'Gb minor': '11A',
  'G major': '9B',  'G minor': '6A',
  'G# major': '4B', 'G# minor': '1A',
  'A major': '11B', 'A minor': '8A',
  'A# major': '6B', 'A# minor': '3A',
  'Bb major': '6B', 'Bb minor': '3A',
  'B major': '1B',  'B minor': '10A',
};

export function toCamelot(keyName) {
  if (!keyName) return '';
  const normalised = keyName.trim()
    .replace(/\bmaj(or)?\b/i, 'major')
    .replace(/\bmin(or)?\b/i, 'minor');
  for (const [k, v] of Object.entries(CAMELOT_MAP)) {
    if (k.toLowerCase() === normalised.toLowerCase()) return `${v} - ${keyName.trim()}`;
  }
  return keyName; // already Camelot or unrecognised — pass through
}
