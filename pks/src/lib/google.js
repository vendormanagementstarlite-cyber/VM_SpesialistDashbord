// Integrasi Google lewat Apps Script Web App (apps-script/Starlite.gs) yang dipasang di akun
// vendor.management@weave.co.id: Drive untuk berkas, Gmail untuk email. Worker hanya memanggil jembatan itu.
import { b64, b64url, b64urlDecode, uid } from './util.js';

export const googleEnabled = (env) => !!(env.APPS_SCRIPT_URL && env.APPS_SCRIPT_KEY);

async function bridge(env, action, payload = {}) {
  const body = JSON.stringify({ ...payload, action, key: env.APPS_SCRIPT_KEY });
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Apps Script membalas lewat redirect 302 ke googleusercontent; fetch mengikutinya otomatis.
      const r = await fetch(env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' });
      const text = await r.text();
      let j;
      try { j = JSON.parse(text); } catch { throw Object.assign(new Error(`Jembatan Google membalas tidak valid (HTTP ${r.status}). Periksa URL Web App dan aksesnya.`), { retry: r.status === 429 || r.status >= 500 }); }
      if (!j.ok) throw Object.assign(new Error('Google: ' + j.error), { retry: false });
      return j.data;
    } catch (err) {
      lastErr = err;
      if (err.retry === false) break;
      await new Promise((s) => setTimeout(s, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

// ---------- Drive ----------
export async function drivePath(env, segments) {
  return (await bridge(env, 'drive_path', { segments })).id;
}

export async function driveUpload(env, folderId, name, mime, bytes) {
  return (await bridge(env, 'drive_upload', { folderId, name, mime, b64: b64(bytes) })).id;
}

export async function driveArsip(env, mitra, name, mime, bytes) {
  return bridge(env, 'drive_arsip', { mitra, name, mime, b64: b64(bytes) });
}

export async function driveDownload(env, fileId) {
  const { b64: data } = await bridge(env, 'drive_download', { id: fileId });
  return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
}

/** Word (.docx) → PDF lewat Google Drive (berkas sementara dihapus oleh jembatan). */
export async function docxKePdf(env, name, bytes) {
  const { b64: data } = await bridge(env, 'docx_pdf', { name, b64: b64(bytes) });
  return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
}

// ---------- Spreadsheet (VM Starlite Sheet) ----------
/** Tulis satu baris berdasarkan kunci (kolom "NO ID"). Hanya kolom yang dikirim yang diubah. */
export async function sheetUpsert(env, sheet, key, data) {
  return bridge(env, 'sheet_upsert', { sheet, kunci: key, kolomKunci: 'NO ID', data }); // 'key' dipakai untuk kunci rahasia jembatan
}

// ---------- Gmail ----------
const encWord = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(new TextEncoder().encode(s))}?=`;
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');

export function buildMime({ from, to, cc = [], subject, html, attachments = [], inReplyTo }) {
  const boundary = 'b_' + uid();
  const h = [
    `From: ${from}`, `To: ${to.join(', ')}`, cc.length ? `Cc: ${cc.join(', ')}` : null,
    `Subject: ${encWord(subject)}`, 'MIME-Version: 1.0',
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null, inReplyTo ? `References: ${inReplyTo}` : null,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter(Boolean);
  let body = `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(new TextEncoder().encode(html)))}`;
  for (const a of attachments) {
    body += `--${boundary}\r\nContent-Type: ${a.mime}; name="${encWord(a.name)}"\r\nContent-Disposition: attachment; filename="${encWord(a.name)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(a.bytes))}`;
  }
  body += `--${boundary}--`;
  return h.join('\r\n') + '\r\n\r\n' + body;
}

export async function gmailSend(env, msg, threadId) {
  const raw = b64url(new TextEncoder().encode(buildMime(msg)));
  return bridge(env, 'gmail_send', { raw, threadId: threadId || null });
}

function textFromPayload(p) {
  if (!p) return '';
  if (p.mimeType === 'text/plain' && p.body?.data) return new TextDecoder().decode(b64urlDecode(p.body.data));
  for (const part of p.parts || []) { const t = textFromPayload(part); if (t) return t; }
  return '';
}

/** Ambil balasan di thread yang bukan dari akun kita. */
export async function gmailThreadReplies(env, threadId, ourAddress) {
  const t = await bridge(env, 'gmail_thread', { threadId });
  const out = [];
  for (const m of t.messages || []) {
    const hdr = Object.fromEntries((m.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
    const from = hdr.from || '';
    if (from.toLowerCase().includes(ourAddress.toLowerCase())) continue;
    let text = textFromPayload(m.payload).split(/\r?\n(?:On .+wrote:|Pada .+menulis:|-----Original Message-----)/)[0].trim();
    out.push({ id: m.id, from, text: text.slice(0, 5000) || '(tanpa isi teks)', at: new Date(Number(m.internalDate)).toISOString() });
  }
  return out;
}

/** Cek versi jembatan tanpa efek samping: versi baru menolak lembar tak dikenal, versi lama tidak mengenal aksinya. */
export async function cekJembatan(env) {
  if (!googleEnabled(env)) return { status: 'nonaktif', pesan: 'APPS_SCRIPT_URL / APPS_SCRIPT_KEY belum diatur di Worker.' };
  try {
    await bridge(env, 'sheet_upsert', { sheet: '__cek_versi__', kunci: 'cek' });
    return { status: 'ok' };
  } catch (e) {
    const m = String(e.message || e);
    if (/tidak diizinkan/.test(m)) return { status: 'ok' };
    if (/aksi tidak dikenal/.test(m)) return { status: 'lama', pesan: 'Starlite Bridge masih versi lama: deploy versi baru (Terapkan → Kelola deployment → Versi baru).' };
    return { status: 'gagal', pesan: m.slice(0, 200) };
  }
}
