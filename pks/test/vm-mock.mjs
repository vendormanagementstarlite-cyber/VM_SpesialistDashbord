// Tiruan backend dashboard (aksi "me") untuk uji: token "tok-utama" = Akun Utama, "tok-biasa" = owner biasa, lainnya ditolak.
import http from 'node:http';
http.createServer((q, r) => { let d = ''; q.on('data', (c) => d += c); q.on('end', () => {
  let t = ''; try { t = JSON.parse(d).token; } catch {}
  r.setHeader('content-type', 'application/json');
  r.end(JSON.stringify(t === 'tok-utama' ? { ok: true, role: 'owner', name: 'Hasanudin', perms: { mainOwner: true } } : t === 'tok-biasa' ? { ok: true, role: 'owner', perms: {} } : { ok: false, error: 'login ulang' }));
}); }).listen(8790, '127.0.0.1', () => console.log('mock VM :8790'));
