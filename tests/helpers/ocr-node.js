// Pipeline de OCR em Node para testes: PDF -> PNG (pdftoppm) -> limpa linhas -> tesseract CLI (TSV) -> palavras.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { cleanLines } from '../../public/js/payslip.js';

export function pdfPagesToWords(pdf, dpi = 200) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
  execFileSync('pdftoppm', ['-r', String(dpi), '-png', pdf, path.join(tmp, 'p')]);
  const pages = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort();
  const out = [];
  for (const f of pages) {
    const png = PNG.sync.read(fs.readFileSync(path.join(tmp, f)));
    const gray = new Uint8Array(png.width * png.height);
    for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.299 * png.data[i * 4] + 0.587 * png.data[i * 4 + 1] + 0.114 * png.data[i * 4 + 2]);
    const clean = cleanLines(gray, png.width, png.height);
    const o = new PNG({ width: png.width, height: png.height });
    for (let i = 0; i < clean.length; i++) { o.data[i * 4] = o.data[i * 4 + 1] = o.data[i * 4 + 2] = clean[i]; o.data[i * 4 + 3] = 255; }
    const cp = path.join(tmp, 'c_' + f);
    fs.writeFileSync(cp, PNG.sync.write(o));
    const tsv = execFileSync('tesseract', [cp, '-', '--psm', '6', '--dpi', String(dpi), 'tsv'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const words = [];
    for (const line of tsv.split('\n').slice(1)) {
      const c = line.split('\t');
      if (c.length < 12 || c[0] !== '5') continue;
      const [l, t, w, h] = [+c[6], +c[7], +c[8], +c[9]];
      if (c[11].trim()) words.push({ t: c[11], x0: l, y0: t, x1: l + w, y1: t + h, conf: +c[10] });
    }
    out.push({ file: f, words, width: png.width, height: png.height });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}
