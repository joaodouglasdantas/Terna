# Loop noturno de DTs — como ativar num projeto (harness 3.4.1)

> **Ideia:** toda madrugada, sem nenhum PC de dev ligado, o harness pega a fila de DTs pequenos
> do projeto, resolve em lote (dois modelos baratos + juíza), commita numa branch própria e abre
> um **Merge Request**. De manhã alguém revisa. Nunca toca a branch principal nem o prod.

## Arquitetura recomendada (a mais à prova de falhas) — "servidor de homolog como espelho"

```
 prod (Cloudways)  ──dump 01:00──▶  homolog (Cloudways, servidor menor)  ──cron 01:30──▶  MR no GitLab
                                    ├─ app de homolog = checkout do noturno (reset p/ origin/main)
                                    ├─ banco da app = <db>_homolog (espelho do prod, anonimizado)
                                    ├─ PHP/MySQL/URL locais → E2E roda contra o próprio código da noite
                                    └─ node + claude (token da assinatura) + OPENROUTER_API_KEY
```

Por que no servidor e não num runner remoto: banco em `localhost` (sem *Remote MySQL* nem
whitelist de IP), URL própria da homolog para o E2E, PHP/MySQL já instalados, e o diretório da app
é o checkout — o que o noturno escreveu é exatamente o que o E2E testa.

### Caminho rapido (4 etapas — o que a aba **Noturno** da tela mostra)

1. Cloudways: criar a application de homolog (servidor menor), liberar SSH, anotar banco/URL.
2. Na sua maquina, uma vez: `claude setup-token` (copie o token).
3. No servidor: `cd ~/applications/<id>/public_html && git clone <repo> . && bash .claude/scripts/noturno-setup.sh`
   — o assistente instala node/claude, pergunta os segredos, **valida item a item** (banco, URL, git push,
   GitLab API, claude -p, OpenRouter, SSH ao prod), instala os crons e roda um `--dry-run`. Termina com `0 falha(s)`.
4. De manha: `bash .claude/scripts/noturno-setup.sh --check && tail -50 ~/noturno.log`; revisar o MR.

### Passo a passo manual (o que o assistente faz por voce)

1. **Cloudways:** criar a application de **homolog** (pode ser num servidor menor/separado do prod).
   Anote: caminho (`~/applications/<id>/public_html`), banco/usuário/senha da app, URL.
2. **Checkout:** dentro do `public_html` da homolog, clonar o repo (deploy token ou chave SSH de
   leitura+escrita — o noturno faz push da branch `wt/noturno-*`).
   `git clone <url-do-repo> . && git checkout main`
3. **Runtime no servidor (SSH):** `nvm install 22 && npm i -g @anthropic-ai/claude-code`
   (mesmo caminho usado no OpenGate). `node -v`, `claude --version`.
4. **Token da assinatura:** na SUA máquina, uma vez: `claude setup-token` → copie o token.
   No servidor, crie `~/.harness-noturno.env` (chmod 600):
   ```
   CLAUDE_CODE_OAUTH_TOKEN=...          # ou ANTHROPIC_API_KEY=... (paga por uso)
   OPENROUTER_API_KEY=sk-or-v1-...      # workers + juíza baratos (teto diário pelo harness.env)
   HARNESS_DB_EXT_HOST=localhost
   HARNESS_DB_EXT_NAME=<db_da_homolog>
   HARNESS_DB_EXT_USER=<user_da_homolog>
   HARNESS_DB_EXT_PASS=<senha_da_homolog>
   HARNESS_URL_EXT=https://<url-da-homolog>/
   GITLAB_TOKEN=glpat-...               # scope api — abre o MR; sem ele, só push da branch
   GITLAB_PROJECT_ID=<id numérico do projeto>
   HARNESS_DUELO_JUIZ_CLOUD=openrouter  # juíza barata; 'themis' gasta a assinatura
   ```
5. **Espelho do prod (01:00):** no servidor de homolog, cron com `.claude/scripts/noturno-db-clone.sh`
   puxando do prod por SSH:
   ```
   0 1 * * *  ssh <user>@<prod> "mysqldump -u <u> -p<s> --single-transaction --routines --triggers <db_prod>" | mysql -u <user_homolog> -p<senha> <db_homolog>
   ```
   (ou `SRC_DB/DST_DB` no script, se os dois bancos estiverem no mesmo servidor). **Anonimize** o
   que for dado pessoal — o bloco SQL do script tem o exemplo.
6. **Noturno (01:30):** cron no servidor de homolog:
   ```
   30 1 * * 1-6  cd ~/applications/<id>/public_html && git fetch -q origin && git checkout -q main && git reset -q --hard origin/main && set -a && . ~/.harness-noturno.env && set +a && bash .claude/scripts/noturno.sh --cloud --max-lotes 3 >> ~/noturno.log 2>&1
   ```
7. **Teste à mão antes de agendar:** rode a linha acima sem o `>> ~/noturno.log` com `--dry-run`
   (prepara tudo, não executa), depois sem `--dry-run` uma vez, de dia, olhando o log
   `.claude/.harness-run/noturno-<data>.log`.

### O que acontece numa noite

`noturno.sh --cloud` → branch `wt/noturno-<data>` → `harness-worktree.sh apontar` (override/`.env`
para o banco da homolog) → `claude -p "/dt-sweep --loop --autonomo"` (sweep com prova; só 🔵 ideia
é fechada sozinha; lotes 🟢 com lock por DT, lote leve = sherlock solo, duelo nos itens mecânicos;
1 commit por item) → push da branch → MR via API. Telemetria em `prds/_metrics/runs/…~noturno-*.jsonl`
e `prds/_metrics/duelos/…~noturno-*.jsonl` (3.5.0; vai no commit). Nada produzido → nenhuma branch, nenhum MR.

### Freios
- `HARNESS_NOTURNO=off` desliga; `HARNESS_NOTURNO_MAX_LOTES` limita a noite; teto diário do OpenRouter
  (`HARNESS_OPENROUTER_BUDGET_USD_DAY`) corta o duelo e o hefesto nativo assume.
- O noturno **nunca** faz merge nem push na principal; o MR é de alguém.
- Falhou no meio: o que fechou está commitado na branch; o resto volta à fila (`unlock`).

## Alternativa — job agendado no GitLab CI (runner remoto)
`.claude/scripts/noturno-ci.yml`: mesmo `noturno.sh --cloud`, com as variáveis acima como CI
variables e o banco acessado remotamente (exige *Remote MySQL* liberado para o IP do runner e,
em projetos cujos specs assumem banco local, uma variável `E2E_DB_HOST`). Use quando não houver
servidor de homolog.
