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
     cd $HOME && rm -rf rh && T=$(tr -d ' \n\r' < $HOME/mnt/Downloads/token-github.txt) &&
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
Contents: Read and write) salvo em Downloads/token-github.txt
(link: https://github.com/settings/personal-access-tokens/new).

## Regras técnicas
- Textos da interface sempre em português do Brasil.
- Nunca commitar dados reais (dados-iniciais*.json, backups, PDFs de contracheque)
  nem chaves/tokens.
- Firebase: projeto `motoboy-ddefa`, site `rh-rei-do-gado`, coleções `rh_*`.
