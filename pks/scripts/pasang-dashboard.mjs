// Memasang hasil bundel (dist/pks-dashboard.js) + penghubung menu ke index.html dashboard VM.
// Pakai: node scripts/pasang-dashboard.mjs /path/ke/VM_SpesialistDashbord/index.html
import { readFileSync, writeFileSync } from 'node:fs';
const f = process.argv[2];
if (!f) { console.error('Sebutkan path index.html dashboard'); process.exit(1); }
let s = readFileSync(f, 'utf8');
const glue = readFileSync('scripts/dashboard-glue.js', 'utf8');
const bundle = readFileSync('dist/pks-dashboard.js', 'utf8');
const ganti = (awal) => { const a = s.indexOf('<script>\n' + awal); if (a < 0) throw new Error('Blok tidak ditemukan: ' + awal); const b = s.indexOf('</script>', a) + 9; return [a, b]; };
let [a, b] = ganti('/* ===== Perjanjian — penghubung menu dashboard');
s = s.slice(0, a) + '<script>\n' + glue + '</script>' + s.slice(b);
[a, b] = ganti('/* ===== Perjanjian (PKS) — dibangun otomatis');
s = s.slice(0, a) + '<script>\n' + bundle + '</script>' + s.slice(b);
writeFileSync(f, s);
console.log('Terpasang di', f);
