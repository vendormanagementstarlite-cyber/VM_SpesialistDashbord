// Pakai: node scripts/hash-password.mjs "<password>"  → mencetak hash untuk kolom pks_pengguna.password_hash
import { hashPassword } from '../src/lib/password.js';
console.log(await hashPassword(process.argv[2] || ''));
