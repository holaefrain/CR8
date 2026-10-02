import { DYMO_LABELS } from './labels.js';

// DYMO Connect's local Web Service. Plain HTTP is deliberate: DYMO Connect
// 1.6.x ships a server certificate with no private key, so its HTTPS listener
// fails every TLS handshake.
const DYMO_WS = 'http://127.0.0.1:41951/DYMO/DLS/Printing';

async function request(command, params) {
  const res = await fetch(`${DYMO_WS}/${command}`, params ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  } : undefined);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}${text ? ' — ' + text.trim() : ''}`);
  return text;
}

export async function isServiceRunning() {
  try {
    await request('StatusConnected');
    return true;
  } catch {
    return false;
  }
}

export async function listLabelWriters() {
  const doc = new DOMParser().parseFromString(await request('GetPrinters'), 'text/xml');
  return [...doc.getElementsByTagName('LabelWriterPrinter')]
    .map(p => ({
      name: p.getElementsByTagName('Name')[0]?.textContent?.trim() || '',
      modelName: p.getElementsByTagName('ModelName')[0]?.textContent?.trim() || '',
      connected: (p.getElementsByTagName('IsConnected')[0]?.textContent || '').trim().toLowerCase() === 'true',
    }))
    .filter(p => p.name);
}

// LabelWriter 550 series report the installed roll. Returns { label, part } or null.
export async function detectRoll(printerName) {
  const info = await request('GetConsumableInfoIn550Printer', { printerName });
  for (const label of DYMO_LABELS) {
    const part = [label.sku, ...(label.also || [])].find(p => info.includes(p));
    if (part) return { label, part };
  }
  return null;
}

export async function printLabel(printerName, labelXml) {
  const ok = await request('PrintLabel', { printerName, printParamsXml: '', labelXml, labelSetXml: '' });
  // The service answers 200 "false" when it accepts the label but can't print it
  if (ok.trim().toLowerCase() === 'false') throw new Error(`${printerName} did not accept the job`);
}
