# Instruções para o Claude — RH Rei do Gado

## Modo de trabalho: AUTÔNOMO
ANTES DE TUDO: leia o documento do Projeto `claude/PEDIDOS.md` (lista de pedidos e status) e continue o que
estiver pendente. Registre ali todo pedido novo e marque "publicado" (com o commit) ao terminar — conversas
novas não enxergam as anteriores, só os documentos do Projeto.

Quando o Marcelo pedir melhoria/alteração/correção, faça tudo sem pedir confirmação.
A fonte da verdade é o GitHub (não a pasta Downloads/rh-rei-do-gado, que fica desatualizada).

1. Ambiente de nuvem: `git clone https://github.com/marcelomreidogado-cmd/rh-rei-do-gado.git`
   e `git config user.name Claude && git config user.email noreply@anthropic.com`.
2. Leia o código relevante em `public/` (JS puro, sem build) e faça a alteração.
3. `npm ci && npm test`. Para os testes E2E também: stage
   `/Users/marcelomaiasilva/Downloads/dados-iniciais-REI-DO-GADO.json` e rode
   `SEED_JSON=<caminho> node --test tests/e2e.test.js` (Chromium já em /opt/pw-browsers;
   `FERIAS_IMG=<foto do relatório de férias>` testa a leitura do relatório).
   Se algo quebrar, corrija antes.
4. Atualize o README.md se a funcionalidade mudou. `git commit` (mensagem em pt-BR).
5. ENVIO (o proxy da nuvem bloqueia push; o envio sai pelo Mac):
   - Nuvem: `mkdir -p /mnt/user-data/outputs/.envio && git format-patch origin/main --stdout > /mnt/user-data/outputs/.envio/envio.patch`
   - `device_commit_files` (force: true): stagedPath acima → devicePath
     `/Users/marcelomaiasilva/Downloads/.rh-envio/envio.patch` (pasta oculta; .git não aceita escrita).
   - device_bash (tudo em $HOME do VM, NUNCA dentro de mnt/Downloads/rh-rei-do-gado, onde o git trava):
     ```
     cd $HOME && rm -rf rh && TF=$HOME/mnt/Downloads/.rh-envio/token-github.txt && [ -s $TF ] || TF=$HOME/mnt/Downloads/token-github.txt;
     T=$(tr -d ' \n\r' < $TF) &&
     git clone -q https://x-access-token:$T@github.com/marcelomreidogado-cmd/rh-rei-do-gado.git rh &&
     cd rh && git config user.name Claude && git config user.email noreply@anthropic.com &&
     git am -q < $HOME/mnt/Downloads/.rh-envio/envio.patch && git push -q origin main 2>&1 | sed "s/$T/***/g"
     ```
   - Depois: na nuvem `git fetch && git reset --hard origin/main` (o `git am` gera outro hash).
   - Nunca mostre o token no chat nem o grave no repositório.
6. O GitHub Actions testa e publica sozinho em https://rh-rei-do-gado.web.app
   (1–3 min). Responda em 1–2 frases o que mudou.

Só pergunte antes se a mudança APAGAR dados no Firestore ou mexer em
`firestore.rules.rh` / login / permissões. Em qualquer outro caso, decida e siga.
Se o push falhar por autenticação: peça ao Marcelo um token novo (GitHub →
Settings → Developer settings → Fine-grained tokens, só este repositório,
Contents: Read and write) salvo em Downloads/.rh-envio/token-github.txt (pasta oculta; o arquivo solto em
Downloads sumiu mais de uma vez)
(link: https://github.com/settings/personal-access-tokens/new).

## Regras técnicas
- Textos da interface sempre em português do Brasil.
- Nunca commitar dados reais (dados-iniciais*.json, backups, PDFs de contracheque)
  nem chaves/tokens.
- Firebase: projeto `motoboy-ddefa`, site `rh-rei-do-gado`, coleções `rh_*`.

## Padrão visual (obrigatório em toda mudança)
Polimento visual feito em 15/11/2026. Para não regredir (o Compras piorou em 16–17/11 por isso):
- **Não colocar estilo solto (`style="..."`) em linhas de tabela, listas ou cartões.** Criar ou reutilizar classes no bloco de CSS do projeto (indicado abaixo). Estilo inline só para valores dinâmicos (cor de loja, largura de barra).
- **Tabelas compactas:** cada linha de produto/cliente/lançamento cabe em ~2 linhas de texto. Controles extras (marcações, botões) ficam pequenos e na mesma linha; detalhes vão para um modal ou para a dica (`title`).
- **Nada passa da largura da tela**, exceto tabelas largas dentro de um contêiner que desliza (com a coluna de nome fixa à esquerda no celular).
- **Celular primeiro:** conferir em 390 px e em 1440 px. No celular: navegação numa faixa/barra única, filtros e chips em faixa que desliza, indicadores em 2 colunas, textos sem cortar no meio da palavra.
- **Números** com algarismos alinhados (`font-variant-numeric: tabular-nums`), sem fonte monoespaçada; valores com sinal não quebram linha.
- Reaproveitar as cores, raios, botões e chips que o sistema já usa — não criar um estilo novo para cada tela.

### Conferência antes de publicar
1. Abrir o sistema com **dados fictícios** e **sem acesso ao banco real** (veja "Como testar o visual" abaixo).
2. Fotografar as telas alteradas em 390 px e 1440 px (Playwright já instalado no ambiente; Chromium em `/opt/pw-browsers`).
3. Medir que `document.documentElement.scrollWidth` não passa da largura da janela em todas as abas.
4. Mostrar ao Marcelo as fotos de **antes e depois** na resposta e dizer o que não foi testado.

### Onde fica o visual / como testar o visual
- CSS em `public/css/app.css` (fim: "v1.23: polimento visual"). Cabeçalho com abas numa faixa única; tabelas `.grid` com coluna `c-nome` de largura fixa.
- Teste: modo demonstração (`/?demo`, login admin/admin) servido por `tests/e2e/server.js` com um seed **fictício** (mesmo formato de `scripts/seed_from_xlsx.py`); navegar pelos hashes `#folha/AAAA-MM`, `#ferias` etc. Rodar também `npm test`.
