// Hash password PBKDF2-SHA256 (WebCrypto; Workers membatasi iterasi maksimum 100.000).
import { b64url, b64urlDecode } from './util.js';

const ITER = 100_000;
const enc = new TextEncoder();

async function derive(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64url(salt)}$${b64url(await derive(password, salt, ITER))}`;
}

export function samaAman(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored || '').split('$');
  if (alg !== 'pbkdf2' || !iter || !salt || !hash) return false;
  return samaAman(await derive(password, b64urlDecode(salt), Number(iter)), b64urlDecode(hash));
}

// Password sementara: tanpa karakter yang mudah tertukar (0/O, 1/l/I).
export function passwordSementara(len = 12) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(len));
  return [...r].map((x) => abc[x % abc.length]).join('');
}

export const POLA_PASSWORD = 'Minimal 10 karakter.';
export const passwordValid = (p) => typeof p === 'string' && p.length >= 10 && p.length <= 200;
