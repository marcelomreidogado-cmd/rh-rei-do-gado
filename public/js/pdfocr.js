// Leitura de contracheques (PDF/imagem) no navegador: pdf.js -> canvas -> limpeza de linhas -> Tesseract.js (por) -> parser.
import { cleanLines, parsePage, dedupeSlips } from './payslip.js';

const V = '/vendor';
let worker = null;

function need(name) { if (!window[name]) throw new Error(`Biblioteca ${name} não carregou. Recarregue a página (Ctrl/⌘+Shift+R).`); }

async function getWorker(onProgress) {
  if (worker) return worker;
  need('Tesseract');
  worker = await Tesseract.createWorker('por', 1, {
    workerPath: `${V}/tesseract/worker.min.js`, corePath: `${V}/tesseract`, langPath: `${V}/tesseract/lang`, gzip: true, workerBlobURL: false,
    logger: (m) => { if (m.status === 'recognizing text') onProgress?.({ stage: 'ocr', progress: m.progress }); },
  });
  await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  return worker;
}

function cleanedCanvas(src) {
  const { width: w, height: h } = src;
  const ctx = src.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = (img.data[i * 4] * 299 + img.data[i * 4 + 1] * 587 + img.data[i * 4 + 2] * 114) / 1000;
  const clean = cleanLines(gray, w, h);
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const oc = out.getContext('2d'); const od = oc.createImageData(w, h);
  for (let i = 0; i < clean.length; i++) { od.data[i * 4] = od.data[i * 4 + 1] = od.data[i * 4 + 2] = clean[i]; od.data[i * 4 + 3] = 255; }
  oc.putImageData(od, 0, 0);
  return out;
}

function crop(canvas, bbox) {
  const padX = 45, padY = 22;
  const x = Math.max(0, Math.floor(bbox.x0 - padX)), y = Math.max(0, Math.floor(bbox.y0 - padY));
  const w = Math.min(canvas.width - x, Math.ceil(bbox.x1 - bbox.x0 + padX * 2)), h = Math.min(canvas.height - y, Math.ceil(bbox.y1 - bbox.y0 + padY * 2));
  const c = document.createElement('canvas');
  const scale = Math.min(1, 1100 / w);
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

async function pagesOf(file, onProgress, minWidth = 1500) {
  const buf = await file.arrayBuffer();
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    need('pdfjsLib');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${V}/pdfjs/pdf.worker.min.js`;
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      onProgress?.({ stage: 'render', file: file.name, page: n, pages: pdf.numPages });
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 200 / 72 });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      pages.push(c);
    }
    return pages;
  }
  const bmp = await createImageBitmap(new Blob([buf], { type: file.type }));
  const c = document.createElement('canvas');
  const k = bmp.width < minWidth ? minWidth / bmp.width : 1;
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return [c];
}

/** Le todos os arquivos e devolve os contracheques unicos (com imagem recortada de cada um). */
export async function readPayslips(files, onProgress) {
  const w = await getWorker(onProgress);
  const all = [];
  for (const f of files) {
    const pages = await pagesOf(f, onProgress);
    for (let i = 0; i < pages.length; i++) {
      onProgress?.({ stage: 'ocr', file: f.name, page: i + 1, pages: pages.length, progress: 0 });
      const { data } = await w.recognize(cleanedCanvas(pages[i]));
      const words = (data.words || []).map((x) => ({ t: x.text, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 }));
      for (const s of parsePage(words)) all.push({ ...s, img: crop(pages[i], s.bbox), arquivo: f.name });
    }
  }
  return dedupeSlips(all);
}

export async function terminate() { if (worker) { await worker.terminate(); worker = null; } }

/** OCR simples (texto por linha) de PDFs/imagens — usado no relatorio de ferias da contabilidade. */
export async function readText(files, onProgress) {
  const w = await getWorker(onProgress);
  let text = '';
  for (const f of files) {
    const pages = await pagesOf(f, onProgress, 2000); // relatorio costuma chegar como foto/print pequeno: amplia antes do OCR
    for (let i = 0; i < pages.length; i++) {
      onProgress?.({ stage: 'ocr', file: f.name, page: i + 1, pages: pages.length, progress: 0 });
      const { data } = await w.recognize(pages[i]); // sem apagar linhas: a limpeza come as barras das datas
      text += (data.text || '') + '\n';
    }
  }
  return text;
}
