// Leitura de contracheques escaneados (OCR). Funcoes puras: recebem palavras {t,x0,y0,x1,y1} e devolvem dados.
// O mesmo codigo roda no navegador (Tesseract.js) e nos testes em Node (tesseract CLI).
import { round2, normName, nameScore } from './calc.js';

/** Remove linhas de tabela (horizontais/verticais longas) para o OCR ler so o texto.
 *  gray: Uint8Array w*h (0..255). Devolve Uint8Array (0 texto, 255 fundo). */
export function cleanLines(gray, w, h, thresh = 160, minRun = 60) {
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < bin.length; i++) bin[i] = gray[i] < thresh ? 1 : 0;
  const out = bin.slice();
  for (let y = 0; y < h; y++) { // horizontais
    let x = 0;
    while (x < w) {
      if (bin[y * w + x]) {
        const s = x;
        while (x < w && bin[y * w + x]) x++;
        if (x - s > minRun) for (let k = s; k < x; k++) out[y * w + k] = 0;
      } else x++;
    }
  }
  const out2 = out.slice();
  for (let x = 0; x < w; x++) { // verticais
    let y = 0;
    while (y < h) {
      if (out[y * w + x]) {
        const s = y;
        while (y < h && out[y * w + x]) y++;
        if (y - s > minRun) for (let k = s; k < y; k++) out2[k * w + x] = 0;
      } else y++;
    }
  }
  const res = new Uint8Array(w * h);
  for (let i = 0; i < res.length; i++) res[i] = out2[i] ? 0 : 255;
  return res;
}

// ---------- utilitarios de OCR ----------
const isMoneyTok = (t) => /^[\d.,]+$/.test(t) && (t.match(/\d/g) || []).length >= 3 && !/^\d{1,3}$/.test(t);
/** OCR costuma perder/trocar virgula e ponto; como todo valor tem 2 casas, os 2 ultimos digitos sao os centavos. */
export function parseMoney(t) {
  const d = String(t).replace(/\D/g, '');
  if (d.length < 3) return NaN;
  return round2(parseInt(d, 10) / 100);
}
const cx = (w) => (w.x0 + w.x1) / 2;
/** "368" + "52" (virgula perdida pelo OCR) -> "368,52" quando estao colados e na area de valores. */
function mergeSplit(words, minX) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i], n = words[i + 1];
    if (n && w.x0 > minX && /^[\d.]{1,7},?$/.test(w.t) && /^\d{2}$/.test(n.t) && n.x0 - w.x1 < (w.x1 - w.x0) * 1.2 + 15) {
      out.push({ ...w, t: `${w.t.replace(/,$/, '')},${n.t}`, x1: n.x1 }); i++;
    } else out.push(w);
  }
  return out;
}
const cy = (w) => (w.y0 + w.y1) / 2;

export function groupLines(words) {
  const ws = words.map((w) => ({ ...w, t: String(w.t || '').replace(/[|_~]/g, '').trim() })).filter((w) => w.t);
  if (!ws.length) return [];
  const hs = ws.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const tol = Math.max(4, hs[Math.floor(hs.length / 2)] * 0.6);
  ws.sort((a, b) => cy(a) - cy(b));
  const lines = [];
  for (const w of ws) {
    const l = lines[lines.length - 1];
    if (l && Math.abs(cy(w) - l.y) <= tol) { l.words.push(w); l.y = (l.y * (l.words.length - 1) + cy(w)) / l.words.length; }
    else lines.push({ y: cy(w), words: [w] });
  }
  for (const l of lines) { l.words.sort((a, b) => a.x0 - b.x0); l.text = l.words.map((w) => w.t).join(' '); l.y0 = Math.min(...l.words.map((w) => w.y0)); l.y1 = Math.max(...l.words.map((w) => w.y1)); }
  return lines;
}

const digitsFix = (s) => s.replace(/[oO]/g, '0').replace(/\D/g, '');

function storeFrom(text, codeTok) {
  const u = normName(text);
  if (/BINGEN/.test(u)) return 'bingen';
  if (/CORREAS|CORREA|GORREAS|UNIAO E INDUSTRIA|UNIAO/.test(u)) return 'correas';
  if (/CORONEL/.test(u)) return 'coronel';
  const c = parseInt(digitsFix(codeTok || ''), 10);
  return { 1: 'bingen', 2: 'correas', 3: 'coronel' }[c] || null;
}

/** Interpreta as palavras de UMA pagina (pode conter 2 vias iguais do mesmo contracheque). */
export function parsePage(words) {
  const lines = groupLines(words);
  const starts = lines.map((l, i) => (/demonstra/i.test(l.text) ? i : -1)).filter((i) => i >= 0);
  const slips = [];
  starts.forEach((si, n) => {
    const seg = lines.slice(si, n + 1 < starts.length ? starts[n + 1] : lines.length);
    const s = parseSlip(seg);
    if (s) slips.push(s);
  });
  return slips;
}

function parseSlip(seg) {
  const issues = [];
  const head = seg[0];
  const dm = head.words.findIndex((w) => /demonstra/i.test(w.t));
  const empresaTxt = head.words.slice(0, dm).map((w) => w.t).join(' ');
  const codeTok = head.words[0]?.t;
  const allText = seg.slice(0, 4).map((l) => l.text).join(' ');
  const storeId = storeFrom(empresaTxt + ' ' + allText, codeTok);

  const per = seg.map((l) => l.text).join(' ').match(/(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
  const periodo = per ? { ini: per[1], fim: per[2] } : null;
  if (!periodo) issues.push('periodo nao encontrado');

  // matricula + nome + cargo
  let matricula = '', nome = '', cargo = '';
  const brk = (t) => t.replace(/^[\[\]{}()<>]+|[\[\]{}()<>]+$/g, '');
  const nameLine = seg.slice(1, 7).find((l) => /^[oO\d]{5,7}$/.test(brk(l.words[0].t)) && /\d/.test(l.words[0].t) && l.words.length >= 3 && !/AIM|CASA|LTDA/i.test(l.text));
  if (nameLine) {
    const ws = nameLine.words.map((w) => ({ ...w, t: brk(w.t) })).filter((w) => w.t);
    matricula = digitsFix(ws[0].t).replace(/^0+/, '') || '0';
    const rest = ws.slice(1);
    let cut = rest.length, big = 0;
    for (let i = 1; i < rest.length; i++) { const g = rest[i].x0 - rest[i - 1].x1; if (g > big) { big = g; cut = i; } }
    const medH = rest.reduce((a, w) => a + (w.y1 - w.y0), 0) / rest.length;
    if (big < medH * 1.5) cut = rest.length; // sem separacao clara
    nome = rest.slice(0, cut).map((w) => w.t).join(' ').trim();
    cargo = rest.slice(cut).map((w) => w.t).join(' ').trim();
  } else issues.push('linha de nome nao encontrada');

  // colunas
  const hIdx = seg.findIndex((l) => /vencimentos/i.test(l.text) && /descontos/i.test(l.text));
  let cols = null;
  if (hIdx >= 0) {
    const hw = seg[hIdx].words;
    const f = (re) => hw.find((w) => re.test(w.t));
    const v = f(/vencimentos/i), d = f(/descontos/i), r = f(/^refer/i), ds = f(/^descri/i);
    if (v && d) cols = { venc: cx(v), desc: cx(d), ref: r ? cx(r) : (cx(v) - (cx(d) - cx(v))), descr: ds ? ds.x0 : 0 };
  }
  if (!cols) issues.push('cabecalho da tabela nao encontrado');

  const itens = [], notas = [];
  let totalVenc = null, totalDesc = null, liquido = null;
  let footer = null;
  if (cols) {
    const colOf = (w) => {
      const c = cx(w);
      const dv = Math.abs(c - cols.venc), dd = Math.abs(c - cols.desc), dr = Math.abs(c - cols.ref);
      const m = Math.min(dv, dd, dr);
      return m === dv ? 'venc' : m === dd ? 'desc' : 'ref';
    };
    let stage = 'items';
    for (let i = hIdx + 1; i < seg.length; i++) {
      const l = { ...seg[i], words: mergeSplit(seg[i].words, cols.ref) };
      l.text = l.words.map((w) => w.t).join(' ');
      if (/declaro|assinatura/i.test(l.text)) break;
      if (/l[ií]qu[ií]?d/i.test(l.text) && stage !== 'footer') {
        const m = l.words.filter((w) => isMoneyTok(w.t));
        if (m.length) liquido = parseMoney(m[m.length - 1].t);
        stage = 'afterLiq';
        continue;
      }
      if (/sal[aá]rio\s*base|contr|fgts|irrf/i.test(l.text) && /base/i.test(l.text) && /fgts|irrf|inss/i.test(l.text) && !/^\d{3}\b/.test(l.text)) { stage = 'footer'; continue; }
      if (stage === 'footer') {
        const nums = l.words.filter((w) => isMoneyTok(w.t) || /^\d{1,3},\d{2}$/.test(w.t));
        if (nums.length >= 5 && !footer) footer = nums.map((w) => parseMoney(w.t));
        continue;
      }
      const first = l.words[0];
      const isItem = first && /^\W*\d{3,4}\W*$/.test(first.t) && cx(first) < (cols.descr || cols.ref) + 30;
      const amountish = (w) => cx(w) > cols.ref + (cols.venc - cols.ref) * 0.5 && /\d/.test(w.t) && (w.t.replace(/[^\d.,]/g, '').length / w.t.length) >= 0.6 && w.t.length >= 4;
      if (isItem && stage === 'items') {
        const code = first.t.replace(/\D/g, '');
        const descWords = [], vals = { venc: null, desc: null };
        let ref = '';
        for (const w of l.words.slice(1)) {
          const c = cx(w);
          if (c < cols.ref - (cols.venc - cols.ref) * 0.45 && !/^[\d.,]+$/.test(w.t)) descWords.push(w.t);
          else if (/^\d+:\d+/.test(w.t)) ref = w.t;
          else if (isMoneyTok(w.t) || /^\d{1,3},\d{2}$/.test(w.t)) {
            const col = colOf(w);
            if (col === 'ref') ref = w.t; else vals[col] = parseMoney(w.t);
          } else if (amountish(w)) { // valor com 1 caractere ilegivel: guarda como desconhecido (sera inferido pela soma)
            const col = colOf(w);
            if (col !== 'ref') vals[col] = NaN;
          } else if (c < cols.venc - (cols.venc - cols.ref) * 0.5) descWords.push(w.t);
        }
        const desc = descWords.join(' ').replace(/^[|:\s]+/, '').trim();
        if (vals.venc != null) itens.push({ cod: code, desc, ref, valor: vals.venc, tipo: 'venc' });
        else if (vals.desc != null) itens.push({ cod: code, desc, ref, valor: vals.desc, tipo: 'desc' });
        else if (desc) itens.push({ cod: code, desc, ref, valor: NaN, tipo: 'desc' }); // sem valor legivel
        continue;
      }
      if (stage === 'items' && !isItem && (l.text.match(/[A-Za-zÀ-ú]/g) || []).length >= 14 && !/^\s*[\d.,\s]+$/.test(l.text) && !/^\W*(valor|total)/i.test(l.text)) notas.push(l.text.replace(/^[\W_]+/, ''));
      if (stage === 'items') {
        // linha de totais (sem codigo): valores nas colunas de vencimentos/descontos
        const m = l.words.filter((w) => isMoneyTok(w.t));
        if (m.length && itens.length) {
          for (const w of m) { const col = colOf(w); if (col === 'venc' && totalVenc == null) totalVenc = parseMoney(w.t); else if (col === 'desc' && totalDesc == null) totalDesc = parseMoney(w.t); }
        }
      }
    }
  }

  // ---- conferencia matematica + reparos automaticos ----
  const fixes = [];
  const sumOf = (t) => round2(itens.filter((i) => i.tipo === t && !Number.isNaN(i.valor)).reduce((a, i) => a + i.valor, 0));
  const unread = (t) => itens.filter((i) => i.tipo === t && Number.isNaN(i.valor));
  const eq = (a, b) => a != null && b != null && Math.abs(a - b) <= 0.011;
  // item ilegivel: infere pelo total (so se houver exatamente um)
  for (const t of ['venc', 'desc']) {
    const u = unread(t), tot = t === 'venc' ? totalVenc : totalDesc;
    if (u.length === 1 && tot != null) {
      const v = round2(tot - sumOf(t));
      if (v > 0) { u[0].valor = v; u[0].inferido = true; fixes.push(`valor do item ${u[0].cod} (${u[0].desc}) inferido pela soma: ${v}`); }
    }
  }
  if (unread('venc').length + unread('desc').length) for (const i of [...unread('venc'), ...unread('desc')]) { issues.push(`item ${i.cod} (${i.desc}) sem valor legivel`); i.valor = 0; }
  let somaVenc = sumOf('venc'), somaDesc = sumOf('desc');
  // total de descontos ilegivel/errado mas o resto fecha: liquido = venc - soma dos descontos
  if (totalDesc != null && !eq(somaDesc, totalDesc) && eq(round2(somaVenc - somaDesc), liquido) && itens.length) { fixes.push(`total de descontos (${totalDesc}) corrigido pela soma dos itens (${somaDesc})`); totalDesc = somaDesc; }
  if (totalVenc != null && !eq(somaVenc, totalVenc) && eq(round2(somaVenc - (totalDesc ?? somaDesc)), liquido) && itens.length) { fixes.push(`total de vencimentos (${totalVenc}) corrigido pela soma dos itens (${somaVenc})`); totalVenc = somaVenc; }
  if (totalDesc == null && liquido != null && eq(round2(somaVenc - somaDesc), liquido)) { totalDesc = somaDesc; fixes.push('total de descontos calculado pelos itens'); }
  if (totalVenc == null && liquido != null && eq(round2(somaDesc + liquido), somaVenc)) { totalVenc = somaVenc; fixes.push('total de vencimentos calculado pelos itens'); }
  if (liquido != null && totalVenc != null && totalDesc != null && !eq(round2(totalVenc - totalDesc), liquido) && eq(somaVenc, totalVenc) && eq(somaDesc, totalDesc)) { fixes.push(`liquido lido (${liquido}) corrigido para ${round2(totalVenc - totalDesc)} (venc - desc)`); liquido = round2(totalVenc - totalDesc); }
  if (totalVenc == null) issues.push('total de vencimentos nao lido');
  if (totalDesc == null) issues.push('total de descontos nao lido');
  if (liquido == null) issues.push('valor liquido nao lido');
  if (totalVenc != null && !eq(somaVenc, totalVenc)) issues.push(`soma dos vencimentos (${somaVenc}) difere do total (${totalVenc})`);
  if (totalDesc != null && !eq(somaDesc, totalDesc)) issues.push(`soma dos descontos (${somaDesc}) difere do total (${totalDesc})`);
  if (liquido != null && totalVenc != null && totalDesc != null && !eq(round2(totalVenc - totalDesc), liquido)) issues.push(`liquido (${liquido}) difere de vencimentos - descontos (${round2(totalVenc - totalDesc)})`);

  let base = null, fgts = null, inssBase = null;
  if (footer) {
    // [salBase, salInss, aliquota, baseFgts, fgtsMes, baseIrrf, faixa]  (aliquota pode nao ser lida)
    const f = footer.length >= 7 ? footer : [footer[0], footer[1], null, ...footer.slice(2)];
    base = { salarioBase: f[0], salContrInss: f[1], aliqInss: f[2], baseFgts: f[3], fgts: f[4], baseIrrf: f[5], faixaIrrf: f[6] ?? null };
    fgts = base.fgts; inssBase = base.salContrInss;
    if (base.baseFgts && fgts != null && Math.abs(round2(base.baseFgts * 0.08) - fgts) > 0.06) issues.push(`FGTS (${fgts}) difere de 8% da base (${round2(base.baseFgts * 0.08)})`);
  } else issues.push('rodape (FGTS/base INSS) nao lido');
  const inssItem = itens.find((i) => i.tipo === 'desc' && /inss/i.test(i.desc));
  const irrfItem = itens.find((i) => i.tipo === 'desc' && /irrf|imposto de renda/i.test(i.desc));
  const inss = inssItem ? inssItem.valor : 0;
  if (!inssItem) issues.push('desconto de INSS nao encontrado');
  if (inssItem && base && base.salContrInss && base.aliqInss && Math.abs(round2(base.salContrInss * base.aliqInss / 100) - inss) > 1.5 && !inssItem.inferido) issues.push(`INSS (${inss}) parece diferente da base x aliquota`);

  const emprestimos = itens.filter((i) => i.tipo === 'desc' && /empr[eé]st|consignad/i.test(i.desc));
  const sigLine = [...seg].reverse().find((l) => /assinatura|declaro/i.test(l.text)) || seg[seg.length - 1];
  const allW = seg.flatMap((l) => l.words);
  const bbox = { x0: Math.min(...allW.map((w) => w.x0)), y0: head.y0, x1: Math.max(...allW.map((w) => w.x1)), y1: sigLine.y1 };
  return { empresa: empresaTxt.replace(/^\W+/, ''), storeId, periodo, matricula, nome, cargo, itens, totalVenc, totalDesc, liquido, inss, irrf: irrfItem ? irrfItem.valor : 0, fgts, inssBase, base, emprestimos: round2(emprestimos.reduce((a, i) => a + i.valor, 0)), issues, fixes, notas, bbox };
}

/** Junta as paginas; as 2 vias do mesmo contracheque viram uma so (mantem a melhor leitura). */
export function dedupeSlips(slips) {
  const score = (s) => s.issues.length * 10 + s.fixes.length + (s.nome ? 0 : 50);
  const sig = (s) => `${s.liquido}|${s.totalVenc}|${s.totalDesc}`;
  const same = (a, b) => a.storeId === b.storeId && (sig(a) === sig(b) || (a.nome && b.nome && nameScore(a.nome, b.nome) >= 0.85));
  const clusters = [];
  for (const s of slips) {
    const c = clusters.find((cl) => cl.some((x) => same(x, s)));
    if (c) c.push(s); else clusters.push([s]);
  }
  return clusters.map((cl) => {
    const best = [...cl].sort((a, b) => score(a) - score(b))[0];
    const named = cl.find((x) => x.nome);
    return best.nome || !named ? best : { ...best, nome: named.nome, matricula: named.matricula, cargo: named.cargo };
  });
}
export const periodoToMonth = (p) => (p && p.fim ? `${p.fim.slice(6, 10)}-${p.fim.slice(3, 5)}` : null);
