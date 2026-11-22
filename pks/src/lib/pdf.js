import { PDFDocument } from 'pdf-lib';
import { fail } from './util.js';

export async function loadPdf(bytes) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    fail(400, 'Berkas bukan PDF yang valid atau terkunci kata sandi');
  }
}

export async function pageCount(bytes) {
  return (await loadPdf(bytes)).getPageCount();
}

/** Tempel gambar TTD+stempel+meterai pada posisi tetap. Mengembalikan PDF baru; PDF sumber tidak diubah. */
export async function stampSignature(pdfBytes, imgBytes, imgMime, pos) {
  const doc = await loadPdf(pdfBytes);
  let img;
  try {
    img = imgMime === 'image/png' ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes);
  } catch {
    fail(400, 'Gambar tanda tangan harus PNG atau JPG yang valid');
  }
  const pages = doc.getPages();
  const idx = pos.page < 0 ? pages.length + pos.page : pos.page;
  const page = pages[idx];
  if (!page) fail(400, 'Posisi halaman TTD tidak valid untuk dokumen ini');
  const width = pos.w;
  const height = img.height * (width / img.width);
  page.drawImage(img, { x: pos.x, y: pos.y, width, height });
  return doc.save({ updateFieldAppearances: false });
}
