# Instruções para o Claude — RH Rei do Gado

## Modo de trabalho: AUTÔNOMO
Quando o Marcelo pedir melhoria/alteração/correção, faça tudo sem pedir confirmação.
A fonte da verdade é o GitHub (não a pasta Downloads/rh-rei-do-gado, que fica desatualizada).

1. Ambiente de nuvem: `git clone https://github.com/marcelomreidogado-cmd/rh-rei-do-gado.git`
   e `git config user.name Claude && git config user.email noreply@anthropic.com`.
2. Leia o código relevante em `public/` (JS puro, sem build) e faça a alteração.
3. `npm ci && npm test`. Para os testes E2E também: stage
   `/Users/marcelomaiasilva/Downloads/dados-iniciais-REI-DO-GADO.json` e rode
   `SEED_JSON=<caminho> CHROME_BIN=<chrome em /opt/pw-browsers> node --test tests/e2e.test.js`.
   Se algo quebrar, corrija antes.
4. Atualize o README.md se a funcionalidade mudou. `git commit` (mensagem em pt-BR).
5. ENVIO (o proxy da nuvem bloqueia push; o envio sai pelo Mac, via device_bash):
   - Nuvem: `git format-patch origin/main --stdout | base64 -w0` → texto B64.
   - device_bash (tudo em $HOME do VM, NUNCA dentro de mnt/Downloads/rh-rei-do-gado,
     onde o git trava):
     ```
     cd $HOME && rm -rf rh && T=$(tr -d ' \n\r' < $HOME/mnt/Downloads/token-github.txt) &&
     git clone -q https://x-access-token:$T@github.com/marcelomreidogado-cmd/rh-rei-do-gado.git rh &&
     cd rh && git config user.name Claude && git config user.email noreply@anthropic.com &&
     echo '<B64>' | base64 -d | git am -q && git push -q origin main 2>&1 | sed "s/$T/***/g"
     ```
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
