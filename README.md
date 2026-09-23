# Folha de Pagamento — Rei do Gado

Sistema de folha de pagamento e RH para as três lojas do Rei do Gado (Bingen,
Correas e Coronel). SPA em JavaScript puro (sem build), hospedado no Firebase
Hosting, com dados no Firestore do projeto `motoboy-ddefa`.

## O que o sistema faz

- **Folha mensal por loja** (loja do registro/CNPJ): prêmio, adiantamento, assiduidade,
  consumo na loja, dias trabalhados (passagem = dias × R$ 11,80), faltas
  (uma ou mais datas) e atestados (datas ou "a partir de X dias"). Campos
  recorrentes (salário, prêmio, adiantamento, assiduidade) propagam
  automaticamente para os meses seguintes quando alterados no mês atual.
- Colunas e linhas sem informação no mês podem ser ocultadas (e restauradas
  depois) sem apagar dado nenhum.
- Botão para copiar a tabela (formatada, pronta para colar num e-mail) —
  usado para enviar à contabilidade todo dia 01.
- Ao enviar a tabela, o mês pode ser fechado (trava edição); pode ser
  reaberto depois se precisar corrigir algo.
- **Contracheques**: depois que a folha volta da contabilidade, os PDFs dos
  contracheques são importados e lidos automaticamente (OCR no navegador,
  com Tesseract.js — não sai nenhum dado do computador). O sistema confere
  as somas de cada contracheque, sinaliza o que precisa conferência manual,
  guarda o líquido a receber, o INSS e o FGTS de cada funcionário, e permite
  enviar o contracheque (a imagem) pelo WhatsApp Web usando o telefone
  cadastrado de cada um.
- **Escala de domingo**: funcionários classificados como atendimento ou
  manipulação; o sistema sugere uma escala com rodízio (quem trabalhou menos
  domingos entra primeiro) respeitando afastamentos, e avisa quando falta
  gente para completar a quantidade configurada por loja.
- **Férias**: para cada funcionário ativo mostra o período aquisitivo em
  aberto, o vencimento, o prazo para iniciar as férias ("conceder até", igual
  ao relatório da contabilidade) e o saldo de dias. Alerta quem está com prazo
  estourado (férias em dobro) ou com menos de 60 dias para marcar — o número
  aparece no menu. Registra férias (início, dias, abono de 10 dias, férias
  divididas) com avisos da CLT (aviso com 30 dias, período mínimo de 5 dias,
  um período de 14) e o funcionário fica indisponível na escala de domingo
  durante as férias. O relatório "Previsão de Vencimento de Férias" da
  contabilidade (PDF ou foto) pode ser importado: o sistema lê as datas (OCR
  no navegador), mostra para conferir e atualiza o vencimento de cada um. Os
  dados de férias ficam dentro do cadastro do funcionário (`rh_employees`),
  então **não precisa mudar as regras do Firestore**.
- **Folha**: entrada, admissão, função e salário ficam só no cadastro
  (aba Funcionários); a folha mostra os lançamentos do mês e uma coluna de
  **Observação** no fim de cada linha. Nome e cabeçalho ficam fixos ao rolar.
  Funcionário novo cadastrado entra sozinho no mês aberto, na loja do registro.
- **Loja do registro × loja onde trabalha**: a folha segue a loja do registro
  (imposto); a escala de domingo usa a loja onde a pessoa trabalha de verdade
  ("Trabalha em", editável na aba Funcionários ou em Escala → Equipe por loja).
  Função administrativa/financeira fica fora da escala automaticamente.
- **Escala de domingo**: todos trabalham no domingo, cada um com **1 folga
  por mês**. "Sugerir folgas" distribui as folgas (colegas da mesma loja e
  função em domingos diferentes) e, quando a folga deixa a loja abaixo do
  mínimo configurado, mostra quem de outra loja (com sobra) cobre. Ajuste
  manual por loja/domingo (Editar ou clique no nome); imagem pronta para o
  WhatsApp e impressão em uma folha.
- **Valores da folha** aparecem em reais (R$ 1.234,56), na tela e no e-mail.
- **Usuários do sistema**: em Configurações → Usuários do sistema, um
  administrador inclui (ID + senha) ou remove o acesso de outras pessoas.
  Requer as regras atualizadas do `firestore.rules.rh` (bloco `rh_admins`).
  Cada usuário tem um **acesso**: *Acesso total* ou *Só Escala e Férias*. O
  segundo só vê as abas Escala de domingo e Férias e, pelas regras do banco,
  não consegue ler folha, salários, CPF, telefones nem contracheques — ele lê
  a coleção `rh_equipe` (cópia do cadastro sem dados sensíveis, mantida pelo
  sistema) e `rh_ferias` (controle de férias).
- **Funcionários**: cadastro com CPF e telefone (validados), loja, cargo,
  categoria (atendimento/manipulação) e situação.
- **Histórico**: toda alteração (quem, quando, o quê) fica registrada.
- **Acesso**: login com ID e senha (Firebase Auth); só quem tem um
  documento em `rh_admins` consegue entrar. Sessão expira após 30 min sem
  uso.

## Estrutura

```
public/            aplicativo (HTML/CSS/JS puro, sem build)
  js/calc.js        regras de negócio (cálculos, datas, afastamentos, férias) — testado
  js/payslip.js      leitura/parser dos contracheques (OCR) — testado
  js/data.js         acesso a dados (Firestore) e regras de propagação
  js/store.js        adaptadores Firestore/memória e autenticação
  js/pdfocr.js        pipeline de OCR no navegador (pdf.js + Tesseract.js)
  js/views/*          telas (folha, contracheques, escala, funcionários, config, histórico)
  vendor/              bibliotecas de terceiros baixadas localmente (ver abaixo)
scripts/seed_from_xlsx.py   converte a planilha original em JSON de carga inicial
tests/               testes automatizados (unitários e ponta-a-ponta)
firestore.rules.rh   bloco de regras para colar nas regras existentes do Firestore
firebase.json, .firebaserc   configuração do Firebase Hosting
.github/workflows/deploy.yml  publica automaticamente a cada push em `main`
```

## Rodando local / testes

```bash
npm ci
npm test                 # testes unitários (calc.js, payslip.js) — não precisam de internet
```

Para rodar a aplicação localmente sem Firebase (modo demonstração, dados em
memória, login `admin`/`admin`):

```bash
npx http-server public -p 8080
# abra http://localhost:8080/?demo
```

Testes ponta-a-ponta (abrem um Chromium de verdade e navegam pelo sistema):

```bash
SEED_JSON=dados-iniciais-REI-DO-GADO.json node --test tests/e2e.test.js
# para testar também a leitura dos PDFs reais e o botão do WhatsApp:
SEED_JSON=dados-iniciais-REI-DO-GADO.json PAYSLIP_DIR=pasta_com_os_pdfs node --test tests/e2e.test.js
# e para testar a leitura do relatório de férias (foto/PDF da contabilidade):
SEED_JSON=dados-iniciais-REI-DO-GADO.json FERIAS_IMG=relatorio-ferias.jpg node --test tests/e2e.test.js
```

## Publicação (GitHub → Firebase Hosting)

O deploy é automático: todo push na branch `main` roda os testes e publica no
Firebase Hosting (workflow em `.github/workflows/deploy.yml`).

### 1. Criar o site de Hosting (uma vez)

O projeto Firebase reaproveitado é o `motoboy-ddefa`, mas os dados de RH
ficam em coleções próprias (`rh_*`) e em um **site de Hosting separado**
(`rh-rei-do-gado`), para não misturar com o site existente do motoboy:

```bash
firebase login
firebase hosting:sites:create rh-rei-do-gado --project motoboy-ddefa
```

(o `firebase.json` já está configurado para publicar nesse site — não
precisa mexer em nada do Hosting que já existe no projeto).

### 2. Criar a credencial do GitHub Actions (uma vez)

```bash
firebase init hosting:github
```

Esse comando cria automaticamente o secret `FIREBASE_SERVICE_ACCOUNT` no
repositório do GitHub (ele pede para você logar no GitHub e escolher o
repositório). Se preferir configurar manualmente, gere uma conta de serviço
em *Configurações do projeto → Contas de serviço* no console do Firebase,
baixe a chave JSON e cole o conteúdo dela num secret do GitHub chamado
`FIREBASE_SERVICE_ACCOUNT` (em *Settings → Secrets and variables → Actions*
do repositório).

### 3. Publicar

```bash
git push origin main
```

O primeiro administrador (veja o próximo passo) precisa existir **antes** de
alguém conseguir logar no site publicado.

## Criando o primeiro administrador (acesso ao sistema)

> Depois do primeiro, os próximos usuários podem ser incluídos pelo próprio
> sistema (Configurações → Usuários do sistema), desde que as regras do
> Firestore estejam atualizadas com o bloco `rh_admins` do `firestore.rules.rh`.

O sistema usa Firebase Auth (e-mail/senha) por trás de um ID simples: o ID
que a pessoa digita vira o e-mail `<ID>@rh.reidogado.app` internamente.
Passos no [console do Firebase](https://console.firebase.google.com/project/motoboy-ddefa):

1. **Authentication → Users → Add user**
   - E-mail: `admin@rh.reidogado.app` (troque `admin` pelo ID que quiser)
   - Senha: defina uma senha forte
   - Copie o **User UID** gerado
2. **Firestore Database → Start collection** (se a coleção `rh_admins` ainda
   não existir) → ID da coleção: `rh_admins` → ID do documento: **cole o UID
   copiado** → adicione um campo qualquer, por exemplo `id` (string) =
   `admin` → Salvar.
3. Pronto: essa pessoa já consegue logar no site com ID `admin` e a senha
   definida.

Para criar mais administradores, repita os dois passos (novo usuário +
documento em `rh_admins/{uid}`). Para remover o acesso de alguém, apague o
documento em `rh_admins/{uid}` (ou desative o usuário em Authentication).

## Regras do Firestore — MUITO IMPORTANTE

⚠️ **Se as regras do Firestore do projeto `motoboy-ddefa` estiverem abertas
(modo de teste, `allow read, write: if true`), os dados de RH ficam
expostos na internet para qualquer pessoa, mesmo sem login.** O próprio
sistema detecta isso automaticamente e mostra um aviso vermelho na tela de
login quando acontece — mas o ideal é já publicar as regras corretas.

Como pedido, **não mexemos nas regras que já existem** para o restante do
projeto (ex.: dados do motoboy). Em vez disso, o arquivo
[`firestore.rules.rh`](./firestore.rules.rh) tem um bloco pronto para você
**colar dentro** do arquivo de regras atual do projeto, sem apagar nada:

1. Abra [Firestore → Regras](https://console.firebase.google.com/project/motoboy-ddefa/firestore/rules)
2. Copie o conteúdo de `firestore.rules.rh` e cole dentro do bloco
   `match /databases/{database}/documents { ... }` que já existe (junto com
   as regras atuais, não no lugar delas)
3. Clique em **Publicar**

Essas regras liberam leitura/escrita nas coleções `rh_*` **somente** para
usuários logados que tenham um documento em `rh_admins/{uid}` — exatamente
quem foi cadastrado no passo anterior.

Se o projeto ainda não tiver nenhuma regra customizada (Firestore criado
"em modo de teste"), considere fortemente usar um **projeto Firebase
separado** só para o RH, já que o modo de teste expira e volta a bloquear
tudo (inclusive o RH) depois de 30 dias, e qualquer regra aberta ali expõe
os dois sistemas.

## Dados iniciais

O arquivo `dados-iniciais-REI-DO-GADO.json` (entregue separadamente, **não
commitado no Git** — contém CPF, telefone e salários) tem os 17
funcionários (13 ativos), os lançamentos de fevereiro a setembro/2026 e os
afastamentos, extraídos da planilha `FOLHA DE PAGAMENTO REI DO GADO
2026.xlsx`. Para carregar: **Configurações → Importar dados iniciais**
dentro do sistema (só entra o que ainda não existir; nada é sobrescrito).

### Observações sobre os dados originais (conferir)

- **Bruno José Telles Matos**: o CPF na planilha não bate no dígito
  verificador — vale conferir com o documento antes de usar para envios
  oficiais.
- **Marcio Gonçalves** (motofretista): não tem CPF nem telefone na
  planilha — cadastre quando tiver a informação.
- **Jaiane Vitória**: está com licença (salário-maternidade) desde
  05/05/2026; o contracheque de agosto menciona término em 01/09/2026, mas
  a planilha de setembro ainda mostra afastamento — confirme a data de
  retorno antes de fechar a folha de setembro.
- **Gustavo Felix**: falta (16–17/07), atestado (21/07–03/08) e depois
  INSS (04/08 até 24/10, conforme o que estava lançado) — o líquido do mês
  fica zerado enquanto durar o INSS.
- **Leticia Rodrigues**: os atestados de julho/agosto foram carregados a
  partir da planilha; se houver atestado em setembro ele ainda não está no
  arquivo de dados iniciais — lance manualmente na aba Folha se for o caso.
- **Regra de assiduidade**: qualquer afastamento no mês (falta, atestado,
  licença) zera a assiduidade daquele mês — confirme se é assim que a
  empresa aplica antes do primeiro fechamento real.

## Bibliotecas de terceiros (vendorizadas)

Para funcionar sem build e sem depender de CDNs externos em produção, as
bibliotecas ficam salvas em `public/vendor/`:

- **Firebase (compat) 9.23.0** — `app`, `auth`, `firestore`
- **pdf.js 3.11.174** — leitura dos PDFs dos contracheques
- **Tesseract.js 5.1.1** (idioma português, `core` simd-lstm e lstm) — OCR
  no navegador

Nenhum arquivo do funcionário ou contracheque sai do navegador: a leitura
(OCR) acontece localmente na máquina de quem está usando o sistema.
