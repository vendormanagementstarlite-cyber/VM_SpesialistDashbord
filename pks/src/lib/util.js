export const now = () => new Date().toISOString();

export const uid = (prefix = '') => prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);

export async function sha256Hex(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return b64url(a);
}

export function b64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
export const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Tambah n hari kerja (Senin–Jumat) dihitung dalam zona WIB, tenggat = akhir hari 23:59 WIB. */
export function addWorkdays(fromIso, n) {
  const WIB = 7 * 3600 * 1000;
  const d = new Date(new Date(fromIso).getTime() + WIB);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) added++;
  }
  d.setUTCHours(23, 59, 0, 0);
  return new Date(d.getTime() - WIB).toISOString();
}

export function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Ambil semua alamat email valid dari teks bebas (dipisah ; , spasi, <...>), unik, huruf kecil. */
export function parseEmails(raw) {
  if (!raw || raw === 'NULL') return [];
  const found = String(raw).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g) || [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

export const clean = (v) => (v === null || v === undefined || v === 'NULL' ? '' : String(v).trim());

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Alamat antarmuka untuk tautan internal di email (UI_URL bila frontend di domain lain, selain itu APP_URL). Tautan portal mitra tetap memakai APP_URL. */
export const uiUrl = (env) => String(env.UI_URL || env.APP_URL).replace(/\/$/, '');
