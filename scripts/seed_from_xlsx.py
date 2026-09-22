#!/usr/bin/env python3
"""
Converte a planilha "FOLHA DE PAGAMENTO REI DO GADO 2026.xlsx" em um JSON de dados iniciais
que o sistema importa pela tela Configuracoes > Importar dados iniciais.

ATENCAO: o JSON gerado contem CPF/telefone/salarios. NAO versione no GitHub (ja esta no .gitignore).

Uso:  python3 scripts/seed_from_xlsx.py planilha.xlsx saida.json
"""
import sys, re, json, unicodedata, datetime as dt
import openpyxl

MONTHS = {  # aba -> chave do mes
    'Rei do Gado FEVEREIRO': '2026-02', 'REI DO GADO MARCO  26': '2026-03', 'REI DO GADO ABRIL 26': '2026-04',
    'REI DO GADO MAIO 26': '2026-05', 'REI DO GADO JUNHO 26': '2026-06', 'REI DO GADO JULHO 26': '2026-07',
    'REI DO GADO AGOSTO 26': '2026-08', 'REI DO GADO SETEMBRO': '2026-09',
}
OPEN_MONTHS = {'2026-09'}
STORES = {'bingen': 'bingen', 'correas': 'correas', 'coronel': 'coronel'}
VT = 11.80


def strip(s):
    s = unicodedata.normalize('NFKD', str(s))
    return ''.join(c for c in s if not unicodedata.combining(c))


def norm(s):
    return re.sub(r'\s+', ' ', strip(s).upper().strip())


def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def to_num(v):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, (dt.datetime, dt.date)):
        return 0.0
    m = re.search(r'-?\d+(?:[.,]\d+)?', str(v).replace('R$', ''))
    if not m:
        return 0.0
    return float(m.group(0).replace(',', '.'))


def to_iso(v):
    if isinstance(v, dt.datetime):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, str):
        m = re.match(r'^(\d{2})/(\d{2})/?(\d{4})$', v.strip())
        if m:
            return f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
    return None


def txt_date(v):
    if isinstance(v, dt.datetime):
        return v.strftime('%d/%m')
    if v is None:
        return ''
    t = str(v).strip()
    return '' if t in ('-', '') else t


PARTICLES = {'DA', 'DE', 'DO', 'DAS', 'DOS', 'E'}


def key_of(name):
    t = [x for x in norm(name).split() if x not in PARTICLES]
    return t[0], (t[1] if len(t) > 1 else '')


def same_person(k1, k2):
    return lev(k1[0], k2[0]) <= 1 and (k1[1] == k2[1] or lev(k1[1], k2[1]) <= 2) and not (k1[0] != k2[0] and k1[1] != k2[1])


def category_of(role):
    r = norm(role)
    if 'ACOUG' in r or 'ACOUGUEIRO' in r:
        return 'manipulacao'
    if 'MOTOFRET' in r:
        return 'nenhum'
    return 'atendimento'


def digits(v):
    return re.sub(r'\D', '', str(v).lower().replace('o', '0')) if v is not None else ''


def slug(k):
    return f'{k[0].lower()}-{k[1].lower()}'


def col_of(h):
    h = norm(h)
    if h.startswith('COD'): return 'cod'
    if h in ('LOJA', 'UNIDADE'): return 'loja'
    if h.startswith('FUNCIONARIO'): return 'nome'
    if h == 'ENTRADA': return 'entrada'
    if h == 'ADMISSAO': return 'admissao'
    if h == 'FUNCAO': return 'funcao'
    if h == 'SALARIO': return 'salario'
    if h.startswith('CONSUMO'): return 'consumo'
    if h == 'FALTA': return 'falta'
    if h == 'ATESTADO': return 'atestado'
    if h.startswith('HORA EXTRA'): return 'horaExtra'
    if h.startswith('FERIADO'): return 'feriado'
    if h == 'ASSIDUIDADE': return 'assiduidade'
    if h == 'ADIANTAMENTO': return 'adiantamento'
    if h == 'PREMIO': return 'premio'
    if h.startswith('DESCONTOS'): return 'descAdic'
    if h.startswith('PASSAGEM'): return 'passagem'
    if h == 'DIAS': return 'dias'
    return None


# Afastamentos com datas conhecidas (interpretados a partir das observacoes da planilha).
# chave = (primeiro nome, segundo nome). type: falta | atestado | licenca | inss
LEAVES = [
    ('gustavo-felix', dict(type='falta', dates=['2026-07-16', '2026-07-17'], note='planilha jul: "16 e 17"')),
    ('gustavo-felix', dict(type='atestado', start='2026-07-21', end='2026-08-03', note='contracheque ago: "Atestado de 21/07/2026 ate 03/08/2026"')),
    ('gustavo-felix', dict(type='inss', start='2026-08-04', end='2026-10-24', note='contracheque ago: "Beneficio de 04/08/2026 ate 24/10/2026"')),
    ('melissa-garcia', dict(type='atestado', start='2026-07-13', end='2026-07-17', note='planilha jul: "13 A 17/07 5 dias"')),
    ('leticia-rodrigues', dict(type='atestado', start='2026-07-28', end='2026-07-31', note='planilha jul: "15 dias a partir 28/07"')),
    ('leticia-rodrigues', dict(type='atestado', start='2026-08-01', end='2026-08-06', note='planilha ago: "1 a 6"')),
    ('jaiane-vitoria', dict(type='licenca', start='2026-05-05', end=None, note='contracheque ago: "Salario Maternidade de 05/05/2026 ate 01/09/2026" (120 dias) - planilha de setembro ainda indica licenca; CONFIRMAR retorno')),
    ('carlos-rodrigo', dict(type='falta', dates=['2026-09-02'], note='planilha set: falta 02/09')),
]
STRUCTURED_MONTHS = {'2026-07', '2026-08', '2026-09'}


def main(src, out):
    wb = openpyxl.load_workbook(src, data_only=True)
    people = {}   # key -> dict
    months = {}
    month_notes = {'2026-07': 'descontar 7 dias de VT', '2026-09': 'acerto gustavo henrique - R$ 271,65 3 dias'}

    for sheet, mk in MONTHS.items():
        ws = wb[sheet]
        colmap = None
        consumo_label = ''
        entries = []
        for row in ws.iter_rows():
            cells = {c.column: c.value for c in row if c.value is not None}
            if any(isinstance(v, str) and norm(v).startswith('FUNCIONARIO') for v in cells.values()):
                colmap = {}
                for c, v in cells.items():
                    if isinstance(v, str):
                        k = col_of(v)
                        if k == 'consumo' and not consumo_label:
                            consumo_label = re.sub(r'(?i)consumo\s*loja', '', v).strip()
                        if k == 'feriado':
                            colmap.setdefault('feriado', []).append(c)
                        elif k:
                            colmap[k] = c
                continue
            if not colmap or 'nome' not in colmap:
                continue
            g = lambda k: cells.get(colmap[k]) if k in colmap else None
            nome, sal = g('nome'), g('salario')
            if not isinstance(nome, str) or not isinstance(sal, (int, float)):
                continue
            loja = STORES.get(norm(g('loja') or '').lower().strip(), None)
            if not loja:
                loja = STORES.get(norm(g('loja') or '').lower(), None)
            k = key_of(nome)
            found = next((pk for pk in people if same_person(pk, k)), None)
            if found is None:
                found = k
                people[found] = dict(key=found, history=[])
            p = people[found]
            dias = to_num(g('dias'))
            passagem = to_num(g('passagem'))
            if dias > 31 and passagem <= 31:  # colunas invertidas na aba de maio
                dias, passagem = passagem, dias
            fer_cols = colmap.get('feriado', [])
            feriado = sum(to_num(cells.get(c)) for c in fer_cols if isinstance(cells.get(c), (int, float)))
            desc = g('descAdic')
            e = dict(
                month=mk, empKey=slug(found), salario=to_num(sal), consumo=to_num(g('consumo')),
                horaExtra=to_num(g('horaExtra')), feriado=feriado,
                assiduidade=to_num(g('assiduidade')), adiantamento=to_num(g('adiantamento')), premio=to_num(g('premio')),
                descAdic=to_num(desc), descAdicNota=(str(desc).strip() if isinstance(desc, str) and desc.strip() not in ('-', '') else ''),
                dias=int(round(dias)), vt=VT,
                faltaTxt=txt_date(g('falta')), atestadoTxt=txt_date(g('atestado')), excluded=False,
            )
            if e['dias'] and abs(round(e['dias'] * VT, 2) - passagem) > 0.5 and passagem:
                e['obs'] = f'passagem na planilha: {passagem:.2f} ({e["dias"]} dias x {VT})'
            entries.append(e)
            p['history'].append(dict(
                month=mk, nome=str(nome).strip(), funcao=str(g('funcao') or '').strip(), loja=loja,
                admissao=to_iso(g('admissao')), entrada=to_iso(g('entrada')), salario=to_num(sal), cod=str(g('cod') or '')))
        months[mk] = dict(entries=entries, consumoPeriodo=consumo_label,
                          status='open' if mk in OPEN_MONTHS else 'closed', note=month_notes.get(mk, ''))

    # Cadastro (CPF, telefone, nascimento)
    cad = wb['FUNCIONARIOS DADOS PESSOAIS']
    cadastro = []
    for r in cad.iter_rows(min_row=2, values_only=True):
        if r[2]:
            cadastro.append(dict(nome=str(r[2]).strip(), cpf=digits(r[3]), nasc=to_iso(r[4]) if isinstance(r[4], dt.datetime) else None, tel=digits(r[5])))

    employees = []
    latest_month = max(months)
    for k, p in people.items():
        last = p['history'][-1]
        first_adm = next((h['admissao'] for h in reversed(p['history']) if h['admissao']), None)
        first_ent = next((h['entrada'] for h in reversed(p['history']) if h['entrada']), None)
        c = next((c for c in cadastro if same_person(key_of(c['nome']), k)), None)
        cpf = c['cpf'] if c else ''
        if cpf and len(cpf) == 10:
            cpf = cpf.zfill(11)
        active = last['month'] == latest_month
        employees.append(dict(
            id=slug(k), nome=last['nome'], funcao=last['funcao'], loja=last['loja'], categoria=category_of(last['funcao']),
            admissao=first_adm, entrada=first_ent, salarioBase=last['salario'], cpf=cpf,
            nascimento=c['nasc'] if c else None, telefone=(c['tel'] if c else ''), ativo=active, matricula='',
        ))

    leaves = []
    for i, (eid, l) in enumerate(LEAVES):
        d = dict(l)
        d.update(id=f'seed-{i+1:02d}', empId=eid)
        leaves.append(d)
    # meses estruturados: descarta texto legado quando ha afastamento estruturado do funcionario
    leave_emps = {l['empId'] for l in leaves}
    for mk in STRUCTURED_MONTHS:
        for e in months[mk]['entries']:
            if e['empKey'] in leave_emps:
                e['faltaTxt'] = e['atestadoTxt'] = ''
            elif e['atestadoTxt'] or e['faltaTxt']:
                e['obs'] = (e.get('obs', '') + f" [planilha: falta={e['faltaTxt']} atestado={e['atestadoTxt']}]").strip()

    # assiduidade base: zero causado por afastamento volta ao padrao 90
    def has_leave(emp, mk):
        y, m = map(int, mk.split('-'))
        ms, me = dt.date(y, m, 1), (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1))
        for l in leaves:
            if l['empId'] != emp:
                continue
            if l['type'] == 'falta':
                if any(ms <= dt.date.fromisoformat(x) <= me for x in l['dates']): return True
            else:
                s = dt.date.fromisoformat(l['start']) if l.get('start') else dt.date.min
                en = dt.date.fromisoformat(l['end']) if l.get('end') else dt.date.max
                if s <= me and en >= ms: return True
        return False
    for mk in STRUCTURED_MONTHS:
        for e in months[mk]['entries']:
            if e['assiduidade'] == 0 and has_leave(e['empKey'], mk):
                e['assiduidade'] = 90.0

    for mk, m in months.items():
        for e in m['entries']:
            e['empId'] = e.pop('empKey')

    data = dict(version=1, geradoEm=dt.datetime.now().isoformat(timespec='seconds'), employees=employees,
                months={k: dict(status=v['status'], consumoPeriodo=v['consumoPeriodo'], note=v['note'], entries=v['entries']) for k, v in months.items()},
                leaves=leaves)
    json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(employees)} funcionarios, {sum(len(m["entries"]) for m in months.values())} lancamentos, {len(leaves)} afastamentos -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
