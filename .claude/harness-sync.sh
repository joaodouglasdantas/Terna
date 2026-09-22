#!/usr/bin/env bash
# .claude/harness-sync.sh (3.0.4 — multi-AI; nucleo inclui .claude/convencoes, harness-ui.mjs
#                          e o agente `prometeu`, worker da skill /prometeu; 3.4.25: .claude/contratos —
#                          os contratos mecanicos por papel que os packets injetam — viaja no nucleo)
# Compara (ou sincroniza) o NUCLEO do harness de um projeto-alvo contra esta copia-mestre,
# por SUPERFICIE de plataforma. Usado pelo agente/skill DEUS para manter os projetos
# vizinhos alinhados ao mestre.
#
# Uso:
#   bash harness-sync.sh --check   <dir-alvo> [--target claude|codex|all]
#   bash harness-sync.sh --dry-run <dir-alvo> [--target ...]   # o que o --apply faria, sem escrever
#   bash harness-sync.sh --apply   <dir-alvo> [--target ...]   # copia o defasado/faltante (preserva o local)
#
# --target ausente => le HARNESS_TARGETS do harness.env do ALVO (csv claude,codex);
#                     alvo sem a linha => 'claude' (retrocompatibilidade total).
#
# SUPERFICIES:
#   claude = nucleo canonico (skills/hooks/scripts/convencoes/templates/agents .md/docs) — e o
#            corpo de TODOS os hosts; a superficie Claude nao tem extras proprios
#            (settings.json e decisao local, nunca propagada).
#   codex  = nucleo canonico + adapters Codex: AGENTS.md (raiz), .agents/skills/*
#            (stubs gerados), .codex/agents/*.toml, .codex/hooks.json,
#            .codex/config.toml.example, .codex/rules/README.md.
#   all    = uniao das duas.
#
# ARQUIVOS GUARDADOS (podem ja existir com conteudo PROPRIO do projeto): AGENTS.md e
# .codex/hooks.json so sao criados/atualizados se ausentes OU se o arquivo do alvo
# contiver o marcador 'harness:managed'. Sem o marcador => linha CONFLITO| e o arquivo
# e PRESERVADO (merge manual — instrucoes no ONBOARDING).
#
# Saida (parseavel, uma por linha — formato historico preservado + linhas novas):
#   TARGET|<claude,codex>                     (superficies em jogo nesta execucao)
#   VERSAO|mestre|<linha HARNESS_VERSION do mestre>
#   VERSAO|alvo|<linha do alvo, ou "ausente">
#   FALTA|nucleo|<arquivo relativo>           (existe no mestre, nao no alvo)
#   DIFERE|nucleo|<arquivo relativo>          (existe nos dois, conteudo diferente)
#   EXTRA|alvo|<arquivo relativo>             (existe no alvo, nao no mestre — customizacao)
#   CONFLITO|guardado|<arquivo>               (existe no alvo SEM marcador — preservado)
#   SETTINGS|hooks|<estado>                   (3.4.12: secao hooks do settings.json — ok|difere|atualizado|local-preservado|criado|erro)
#   SETTINGS|permissions|<estado>             (3.4.23: allowlist por UNIAO — idem + desligado; nada e removido do projeto)
#   RESUMO|contagem|ok=N diferem=N faltam=N
#   COPIARIA|<arquivo>                        (so no --dry-run)
#   COPIADO|<arquivo>                         (so no --apply)
#   BACKUP|<dir>                              (--apply: onde os substituidos foram salvos)
#   VERSAO_ATUALIZADA|<linha>                 (--apply)
#   ONBOARDING|<de -> para>|<instrucao>       (--apply com copias)
#
# Exit codes: 0 = alinhado | 10 = defasado | 20 = sem harness (.claude ausente) | 2 = erro de uso.
#
# NUNCA toca no que e local do projeto (perfil, settings.json/settings.local, harness.env
# alem da versao/targets, memory, knowledge, rag, PRDs reais). NAO propaga os agentes
# corporativos Beta (datilografo, zelador) — so os genericos.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../harness/.claude
MASTER_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"                  # .../harness

MODE="${1:-}"
TARGET_IN="${2:-}"
TARGET_SEL=""
shift 2 2>/dev/null || true
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET_SEL="${2:-}"; shift 2 2>/dev/null || shift ;;
    --target=*) TARGET_SEL="${1#--target=}"; shift ;;
    *) printf 'argumento desconhecido: %s\n' "$1" >&2; exit 2 ;;
  esac
done

case "$MODE" in
  --check|--apply|--dry-run) ;;
  *) printf 'uso: harness-sync.sh --check|--dry-run|--apply <dir-alvo> [--target claude|codex|all]\n' >&2; exit 2 ;;
esac
if [ -z "$TARGET_IN" ] || [ ! -d "$TARGET_IN" ]; then
  printf 'alvo invalido (dir inexistente): %s\n' "$TARGET_IN" >&2; exit 2
fi
TARGET_ROOT="$(cd "$TARGET_IN" && pwd)"

# --- Resolve as superficies (--target > HARNESS_TARGETS do alvo > claude) ----
if [ -z "$TARGET_SEL" ]; then
  TARGET_SEL="$(grep -E "^HARNESS_TARGETS=" "$TARGET_ROOT/.claude/harness.env" 2>/dev/null \
    | head -1 | cut -d= -f2- | tr -d "'\"[:space:]")"
  [ -z "$TARGET_SEL" ] && TARGET_SEL="claude"
  [ "$TARGET_SEL" = "claude,codex" ] || [ "$TARGET_SEL" = "codex,claude" ] && TARGET_SEL="all"
fi
case "$TARGET_SEL" in
  claude|codex|all) ;;
  *) printf 'target invalido: %s (use claude|codex|all)\n' "$TARGET_SEL" >&2; exit 2 ;;
esac
WANT_CODEX=0
[ "$TARGET_SEL" = "codex" ] || [ "$TARGET_SEL" = "all" ] && WANT_CODEX=1
case "$TARGET_SEL" in
  all) printf 'TARGET|claude,codex\n' ;;
  *)   printf 'TARGET|%s\n' "$TARGET_SEL" ;;
esac

# --- Definicao do NUCLEO -----------------------------------------------------
# Comum (corpo canonico — viaja em QUALQUER target):
CORE_DIRS=(".claude/skills" ".claude/hooks" ".claude/scripts" ".claude/convencoes" ".claude/contratos" "prds/_templates")
CORE_FILES=(".claude/harness-doctor.sh" ".claude/harness-sync.sh" ".claude/ONBOARDING.md" ".claude/RAG.md" ".claude/RAG-PORTING.md" ".claude/harness-config.html" ".claude/harness-ui.mjs" ".claude/PLAYBOOK-TELEMETRIA.md" ".claude/PLATAFORMAS.md" ".claude/agents/.gitattributes" "prds/_metrics/README.md")
CORE_AGENTS=("beholder" "michelangelo" "tony-stark" "sherlock" "atlas" "hefesto" "peter-quill" "ariadne" "dedalo" "prometeu" "themis" "hermes")   # genericos; Beta (datilografo/zelador) ficam de fora

# Superficie Codex (adapters — so com target codex/all):
CODEX_DIRS=(".agents/skills" ".codex/agents")
CODEX_FILES=(".codex/config.toml.example" ".codex/rules/README.md")
# Guardados: podem ter conteudo proprio do projeto — exigem marcador p/ atualizar.
GUARDED_FILES=("AGENTS.md" ".codex/hooks.json")
# Guardados da superficie CLAUDE (DT-003/01-09-2026): o db-test.sh canonico da mestre e
# worktree-aware e le o Perfil, mas projeto pode ter ADAPTADOR PROPRIO legitimo (caso
# real: Caronte usa usuario least-privilege dedicado cuja senha NAO vive no Perfil de
# proposito) — sobrescrever quebraria o wrapper que funciona. Sem marcador => preservado.
GUARDED_CORE=(".claude/scripts/db-test.sh")
GUARD_MARK="harness:managed"

# Lista os arquivos-nucleo (caminhos relativos) a partir do MESTRE, conforme o target.
collect() {
  local d f a g
  for d in "${CORE_DIRS[@]}"; do
    if [ -d "$MASTER_ROOT/$d" ]; then
      find "$MASTER_ROOT/$d" -type f | LC_ALL=C sort | while IFS= read -r f; do
        f="${f#"$MASTER_ROOT"/}"
        # guardados da superficie claude saem do fluxo normal (comparados a parte)
        for g in "${GUARDED_CORE[@]}"; do [ "$f" = "$g" ] && continue 2; done
        printf '%s\n' "$f"
      done
    fi
  done
  for f in "${CORE_FILES[@]}"; do
    [ -f "$MASTER_ROOT/$f" ] && printf '%s\n' "$f"
  done
  for a in "${CORE_AGENTS[@]}"; do
    [ -f "$MASTER_ROOT/.claude/agents/$a.md" ] && printf '%s\n' ".claude/agents/$a.md"
  done
  if [ "$WANT_CODEX" = "1" ]; then
    for d in "${CODEX_DIRS[@]}"; do
      if [ -d "$MASTER_ROOT/$d" ]; then
        find "$MASTER_ROOT/$d" -type f | LC_ALL=C sort | while IFS= read -r f; do
          printf '%s\n' "${f#"$MASTER_ROOT"/}"
        done
      fi
    done
    for f in "${CODEX_FILES[@]}"; do
      [ -f "$MASTER_ROOT/$f" ] && printf '%s\n' "$f"
    done
  fi
}

# Guardados aplicaveis ao target atual (existentes no mestre).
collect_guarded() {
  local f
  for f in "${GUARDED_CORE[@]}"; do
    [ -f "$MASTER_ROOT/$f" ] && printf '%s\n' "$f"
  done
  [ "$WANT_CODEX" = "1" ] || return 0
  for f in "${GUARDED_FILES[@]}"; do
    [ -f "$MASTER_ROOT/$f" ] && printf '%s\n' "$f"
  done
}

# O alvo pode atualizar este arquivo guardado? (ausente = sim; com marcador = sim)
guard_ok() { # $1 = rel path
  [ ! -f "$TARGET_ROOT/$1" ] && return 0
  grep -q "$GUARD_MARK" "$TARGET_ROOT/$1" 2>/dev/null && return 0
  return 1
}

# --- Passada unica em Node (3.4.11) ------------------------------------------
# Medido 02/09 no Windows com 3 sessoes autonomas vivas: cada processo novo do Git Bash
# custava ~1,8 s; o sync abria 300-500 (um `cmp` por arquivo em 2 loops + mkdir/cp/backup
# por copia) => dry-run > 10 min e --apply morto por timeout. Aqui a comparacao e a copia
# de TODOS os arquivos-nucleo acontecem em UM processo: le a lista de relativos no stdin
# e devolve uma linha por arquivo (OK|DIFERE|FALTA no modo check; COPIADO|COPIARIA|ERRO no
# apply/dry-run, com backup no --apply). Preserva o bit de execucao (hooks no Mac).
# Sem Node (HARNESS_RAG_NODE ou `node` no PATH) => caminho antigo, arquivo a arquivo.
SYNC_NODE="${HARNESS_RAG_NODE:-}"
[ -z "$SYNC_NODE" ] && command -v node >/dev/null 2>&1 && SYNC_NODE="node"
[ "${HARNESS_SYNC_NODE:-1}" = "1" ] || SYNC_NODE=""
SYNC_JS='const fs=require("fs"),p=require("path");
const [mode,M,T,B]=process.argv.slice(1);
const rels=fs.readFileSync(0,"utf8").split(/\r?\n/).filter(Boolean);
let backup=false;
for(const rel of rels){
  const a=p.join(M,rel), b=p.join(T,rel);
  if(mode==="check"){
    if(!fs.existsSync(b)){ console.log("FALTA|"+rel); continue; }
    let x,y; try{ x=fs.readFileSync(a); y=fs.readFileSync(b); }catch(e){ console.log("DIFERE|"+rel); continue; }
    console.log((x.equals(y)?"OK|":"DIFERE|")+rel); continue;
  }
  if(mode==="dry-run"){ console.log("COPIARIA|"+rel); continue; }
  try{
    if(fs.existsSync(b)){ const bk=p.join(B,rel); fs.mkdirSync(p.dirname(bk),{recursive:true}); fs.copyFileSync(b,bk); backup=true; }
    fs.mkdirSync(p.dirname(b),{recursive:true}); const tmp=b+".tmp-sync"; fs.copyFileSync(a,tmp); try{ fs.renameSync(tmp,b); }catch(e){ try{fs.unlinkSync(tmp);}catch(x){} throw e; }
    try{ fs.chmodSync(b, fs.statSync(a).mode); }catch(e){}
    console.log("COPIADO|"+rel);
  }catch(e){ console.log("ERRO|copia falhou|"+rel+"|"+String(e.message||e)); }
}
if(backup) console.log("BACKUP|"+B);'
sync_node() { # $1 = check|dry-run|apply ; $2 = backup dir (apply) ; stdin = lista de relativos
  "$SYNC_NODE" -e "$SYNC_JS" "$1" "$MASTER_ROOT" "$TARGET_ROOT" "${2:-}" 2>/dev/null
}

# --- settings.json: a secao "hooks" VIAJA com o sync (3.4.12) --------------------------
# Regra do Charles (02/09): toda config de otimizacao/performance viaja no mestre — ninguem pode
# "esquecer de ligar" o wiring Node, o matcher da presenca ou o watchdog. O sync passa a levar a
# secao `hooks` do settings.json do mestre para o projeto, PRESERVANDO o resto (permissions, env,
# model...). Escape para wiring local legitimo: `"harness": {"hooks": "local"}` no settings do
# projeto => preservado e reportado. Sem settings.json no alvo => copia o do mestre inteiro.
# Saida: SETTINGS|hooks|ok | SETTINGS|hooks|difere (check/dry-run) | SETTINGS|hooks|atualizado |
#        SETTINGS|hooks|local-preservado | SETTINGS|hooks|criado | SETTINGS|hooks|erro|<msg>
#
# 3.4.23 (item 18): a secao `permissions.allow` do mestre TAMBEM viaja — por UNIAO: o que o
# projeto ja tem fica, o que falta do mestre entra, NADA e removido (regra estreita do Perfil,
# regra local do dev, tudo preservado). Motivo medido 04/09: `permissions.allow` do Mariana
# vazio, 76 prompts de permissao em 11 runs do Joao. O escape `"harness": {"hooks": "local"}`
# vale para as duas secoes; `"harness": {"permissions": "local"}` preserva SO a allowlist.
# Kill switch (ambiente, nao versionado): HARNESS_SYNC_PERMISSIONS=0 deixa de levar a allowlist.
# Segunda linha de saida: SETTINGS|permissions|ok|difere|atualizado|local-preservado|criado|desligado
SETTINGS_JS='const fs=require("fs");
const [mode,M,T,permOn]=process.argv.slice(1);
const mp=M+"/.claude/settings.json", tp=T+"/.claude/settings.json";
let ms; try{ ms=JSON.parse(fs.readFileSync(mp,"utf8")); }catch(e){ console.log("SETTINGS|hooks|erro|mestre sem settings.json legivel"); console.log("SETTINGS|permissions|erro|mestre sem settings.json legivel"); process.exit(0); }
const mAllow=(ms.permissions&&Array.isArray(ms.permissions.allow))?ms.permissions.allow:[];
if(!fs.existsSync(tp)){
  if(mode==="apply"){ fs.mkdirSync(T+"/.claude",{recursive:true}); fs.writeFileSync(tp, JSON.stringify(ms,null,2)+"\n"); console.log("SETTINGS|hooks|criado"); console.log("SETTINGS|permissions|criado"); }
  else { console.log("SETTINGS|hooks|difere|alvo sem settings.json"); console.log("SETTINGS|permissions|difere|alvo sem settings.json"); }
  process.exit(0);
}
let raw=fs.readFileSync(tp,"utf8"), ts;
try{ ts=JSON.parse(raw); }catch(e){ console.log("SETTINGS|hooks|erro|settings.json do alvo invalido — corrija a mao"); console.log("SETTINGS|permissions|erro|settings.json do alvo invalido"); process.exit(0); }
const H=ts.harness||{};
let hooksSt, permSt;
if(H.hooks==="local"){ hooksSt="local-preservado"; }
else hooksSt = (JSON.stringify(ts.hooks||null)===JSON.stringify(ms.hooks||null)) ? "ok" : "difere";
let faltam=[];
if(permOn!=="1") permSt="desligado";
else if(H.hooks==="local"||H.permissions==="local") permSt="local-preservado";
else {
  const tAllow=(ts.permissions&&Array.isArray(ts.permissions.allow))?ts.permissions.allow:[];
  faltam=mAllow.filter(r=>!tAllow.includes(r));
  permSt = faltam.length ? "difere" : "ok";
}
if(mode!=="apply" || (hooksSt!=="difere" && permSt!=="difere")){
  console.log("SETTINGS|hooks|"+hooksSt); console.log("SETTINGS|permissions|"+permSt+(faltam.length?"|faltam="+faltam.length:"")); process.exit(0);
}
const crlf=raw.includes("\r\n");
if(hooksSt==="difere"){ ts.hooks=ms.hooks; hooksSt="atualizado"; }
if(permSt==="difere"){ ts.permissions=ts.permissions||{}; ts.permissions.allow=(Array.isArray(ts.permissions.allow)?ts.permissions.allow:[]).concat(faltam); permSt="atualizado"; }
let out=JSON.stringify(ts,null,2)+"\n"; if(crlf) out=out.replace(/\n/g,"\r\n");
const tmp=tp+".tmp-sync"; fs.writeFileSync(tmp,out); fs.renameSync(tmp,tp);
console.log("SETTINGS|hooks|"+hooksSt); console.log("SETTINGS|permissions|"+permSt+(faltam.length?"|entraram="+faltam.length:""));'
sync_settings() { # $1 = check|dry-run|apply  (imprime 2 linhas: hooks e permissions)
  [ -n "$SYNC_NODE" ] || { printf 'SETTINGS|hooks|erro|sem node — confira o wiring a mao (ONBOARDING 3.4.12)\nSETTINGS|permissions|erro|sem node\n'; return 0; }
  "$SYNC_NODE" -e "$SETTINGS_JS" "$1" "$MASTER_ROOT" "$TARGET_ROOT" "${HARNESS_SYNC_PERMISSIONS:-1}" 2>/dev/null
}

mver="$(grep -E '^HARNESS_VERSION' "$MASTER_ROOT/.claude/harness.env" 2>/dev/null | head -1)"
tver="$(grep -E '^HARNESS_VERSION' "$TARGET_ROOT/.claude/harness.env" 2>/dev/null | head -1)"

printf 'VERSAO|mestre|%s\n' "${mver:-?}"
printf 'VERSAO|alvo|%s\n'   "${tver:-ausente}"

# Sem .claude no alvo = sem harness portado (o corpo canonico vive em .claude,
# inclusive para um projeto que so use o Codex).
if [ ! -d "$TARGET_ROOT/.claude" ]; then
  printf 'RESUMO|sem_harness|.claude ausente no alvo\n'
  exit 20
fi

# --- Comparacao --------------------------------------------------------------
OKN=0; DIFF=0; MISS=0; CONF=0
NUCLEO_LISTA="$(collect)"          # coletada UMA vez (era chamada de novo no apply)
PENDENTES=""                       # relativos a copiar (FALTA/DIFERE), 1 por linha
if [ -n "$SYNC_NODE" ]; then
  while IFS='|' read -r st rel; do
    [ -z "$rel" ] && continue
    case "$st" in
      FALTA)  printf 'FALTA|nucleo|%s\n' "$rel"; MISS=$((MISS+1)); PENDENTES="${PENDENTES}${rel}
" ;;
      DIFERE) printf 'DIFERE|nucleo|%s\n' "$rel"; DIFF=$((DIFF+1)); PENDENTES="${PENDENTES}${rel}
" ;;
      OK)     OKN=$((OKN+1)) ;;
    esac
  done < <(printf '%s\n' "$NUCLEO_LISTA" | sync_node check)
else
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    if [ ! -f "$TARGET_ROOT/$rel" ]; then
      printf 'FALTA|nucleo|%s\n' "$rel"; MISS=$((MISS+1)); PENDENTES="${PENDENTES}${rel}
"
    elif ! cmp -s "$MASTER_ROOT/$rel" "$TARGET_ROOT/$rel"; then
      printf 'DIFERE|nucleo|%s\n' "$rel"; DIFF=$((DIFF+1)); PENDENTES="${PENDENTES}${rel}
"
    else
      OKN=$((OKN+1))
    fi
  done < <(printf '%s\n' "$NUCLEO_LISTA")
fi

# Guardados: comparados a parte (conflito NAO conta como defasagem copiavel).
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  if guard_ok "$rel"; then
    if [ ! -f "$TARGET_ROOT/$rel" ]; then
      printf 'FALTA|nucleo|%s\n' "$rel"; MISS=$((MISS+1))
    elif ! cmp -s "$MASTER_ROOT/$rel" "$TARGET_ROOT/$rel"; then
      printf 'DIFERE|nucleo|%s\n' "$rel"; DIFF=$((DIFF+1))
    else
      OKN=$((OKN+1))
    fi
  else
    printf 'CONFLITO|guardado|%s\n' "$rel"; CONF=$((CONF+1))
  fi
done < <(collect_guarded)

# Extras: arquivos nos diretorios-nucleo do ALVO que nao existem no mestre (customizacao local).
EXTRA_DIRS=("${CORE_DIRS[@]}" ".claude/agents")
[ "$WANT_CODEX" = "1" ] && EXTRA_DIRS+=("${CODEX_DIRS[@]}")
for d in "${EXTRA_DIRS[@]}"; do
  if [ -d "$TARGET_ROOT/$d" ]; then
    find "$TARGET_ROOT/$d" -type f -not -path '*__pycache__*' -not -name '*.pyc' | while IFS= read -r f; do
      rel="${f#"$TARGET_ROOT"/}"
      [ -f "$MASTER_ROOT/$rel" ] || printf 'EXTRA|alvo|%s\n' "$rel"
    done
  fi
done
# (a contagem de extras fica no proprio stream; o consumidor soma as linhas EXTRA|)

SET_LINHA="$(sync_settings check)"; printf '%s\n' "$SET_LINHA"
# 3.4.23: duas linhas (hooks + permissions); cada secao que difere conta 1 no resumo
SET_DIFF=0
while IFS= read -r sl; do
  case "$sl" in SETTINGS\|hooks\|difere*|SETTINGS\|permissions\|difere*) DIFF=$((DIFF+1)); SET_DIFF=$((SET_DIFF+1)) ;; esac
done <<EOF_SET
$SET_LINHA
EOF_SET

# --- 3.5.7: CAMADAS DE CONFIGURACAO — drift do harness.env(.local) do ALVO contra o mestre --------------------
# Regra: NENHUMA decisao do harness vive em variavel local. hooks/harness-env.mjs (do MESTRE) compara as chaves
# ativas do alvo com hooks/_defaults.env + hooks/_camadas.txt e imprime:
#   ENV|decisao-no-projeto|<chave>|<arquivo>|igual|<v>              -> migravel: o --apply COMENTA a linha (o valor ja e o default)
#   ENV|decisao-no-projeto|<chave>|<arquivo>|difere|<v>|default=<d>  -> override consciente: PRESERVADO e reportado
#   ENV|decisao-no-projeto|<chave>|<arquivo>|esperado|<v>            -> override em camada onde e esperado (_camadas.txt)
#   ENV|obsoleta|<chave>|<arquivo>                                   -> chave que o mestre nao conhece (preservada; avaliar)
#   ENV|maquina-versionada|<chave>                                   -> chave de MAQUINA (segredo/runtime) no harness.env versionado
#   ENV|resumo|migraveis=N overrides=N esperados=N obsoletas=N
# Chaves migraveis contam 1 no `diferem` (o projeto esta defasado em relacao a regra); overrides e obsoletas so reportam.
ENV_LINHAS=""; ENV_MIGRAVEIS=0
if [ -n "$SYNC_NODE" ] && [ -f "$MASTER_ROOT/.claude/hooks/harness-env.mjs" ] && [ -f "$TARGET_ROOT/.claude/harness.env" ]; then
  ENV_LINHAS="$("$SYNC_NODE" "$MASTER_ROOT/.claude/hooks/harness-env.mjs" --drift "$TARGET_ROOT" 2>/dev/null)"
  [ -n "$ENV_LINHAS" ] && printf '%s\n' "$ENV_LINHAS"
  ENV_MIGRAVEIS="$(printf '%s\n' "$ENV_LINHAS" | sed -n 's/^ENV|resumo|migraveis=\([0-9]*\).*/\1/p' | head -1)"
  case "$ENV_MIGRAVEIS" in ''|*[!0-9]*) ENV_MIGRAVEIS=0 ;; esac
  [ "$ENV_MIGRAVEIS" -gt 0 ] && DIFF=$((DIFF+1))
fi
printf 'RESUMO|contagem|ok=%s diferem=%s faltam=%s\n' "$OKN" "$DIFF" "$MISS"

if [ "$MODE" = "--check" ]; then
  if [ $((DIFF + MISS)) -gt 0 ]; then exit 10; else exit 0; fi
fi

# --- Aplicacao (--apply) e ensaio (--dry-run) --------------------------------
# Copia defasados/faltantes, preserva o local; --apply salva BACKUP dos substituidos.
COP=0
ERR=0
BACKUP_DIR=""
copy_one() { # $1 = rel
  local rel="$1"
  if [ "$MODE" = "--dry-run" ]; then
    printf 'COPIARIA|%s\n' "$rel"
    COP=$((COP + 1))
    return 0
  fi
  if [ -f "$TARGET_ROOT/$rel" ]; then
    if [ -z "$BACKUP_DIR" ]; then
      BACKUP_DIR="$TARGET_ROOT/.claude/.harness-run/sync-backup/$(date +%Y%m%d-%H%M%S)"
      # .harness-run auto-ignorado mesmo se o .gitignore do alvo nao o cobrir
      # (o sync nao propaga .gitignore) — senao o backup viraria lixo untracked.
      mkdir -p "$TARGET_ROOT/.claude/.harness-run" 2>/dev/null
      [ -f "$TARGET_ROOT/.claude/.harness-run/.gitignore" ] || printf '*\n' > "$TARGET_ROOT/.claude/.harness-run/.gitignore" 2>/dev/null
      # retencao: backups de sync com mais de 30 dias sao lixo
      find "$TARGET_ROOT/.claude/.harness-run/sync-backup" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null
    fi
    if ! mkdir -p "$BACKUP_DIR/$(dirname "$rel")" 2>/dev/null || \
       ! cp -p "$TARGET_ROOT/$rel" "$BACKUP_DIR/$rel" 2>/dev/null; then
      printf 'ERRO|backup falhou|%s\n' "$rel"; ERR=$((ERR + 1))
      return 1   # sem backup, nao sobrescreve — preservacao antes de atualizacao
    fi
  fi
  if ! mkdir -p "$(dirname "$TARGET_ROOT/$rel")" 2>/dev/null || \
     ! cp -p "$MASTER_ROOT/$rel" "$TARGET_ROOT/$rel" 2>/dev/null; then
    printf 'ERRO|copia falhou|%s\n' "$rel"; ERR=$((ERR + 1))
    return 1
  fi
  printf 'COPIADO|%s\n' "$rel"
  COP=$((COP + 1))
}

if [ -n "$SYNC_NODE" ] && [ -n "$PENDENTES" ]; then
  # 3.4.11: uma passada so — backup + copia de todos os pendentes num processo
  NODE_MODE="apply"; [ "$MODE" = "--dry-run" ] && NODE_MODE="dry-run"
  if [ "$NODE_MODE" = "apply" ]; then
    BACKUP_DIR="$TARGET_ROOT/.claude/.harness-run/sync-backup/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$TARGET_ROOT/.claude/.harness-run" 2>/dev/null
    [ -f "$TARGET_ROOT/.claude/.harness-run/.gitignore" ] || printf '*\n' > "$TARGET_ROOT/.claude/.harness-run/.gitignore" 2>/dev/null
    find "$TARGET_ROOT/.claude/.harness-run/sync-backup" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null
  fi
  BACKUP_USADO=""
  while IFS= read -r linha; do
    [ -z "$linha" ] && continue
    case "$linha" in
      COPIADO\|*|COPIARIA\|*) printf '%s\n' "$linha"; COP=$((COP + 1)) ;;
      ERRO\|*)                 printf '%s\n' "$linha"; ERR=$((ERR + 1)) ;;
      BACKUP\|*)               BACKUP_USADO="${linha#BACKUP|}" ;;
    esac
  done < <(printf '%s' "$PENDENTES" | sync_node "$NODE_MODE" "$BACKUP_DIR")
  [ -n "$BACKUP_USADO" ] || BACKUP_DIR=""
else
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    copy_one "$rel"
  done < <(printf '%s' "$PENDENTES")
fi

while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  guard_ok "$rel" || continue   # conflito ja reportado — preservado
  if [ ! -f "$TARGET_ROOT/$rel" ] || ! cmp -s "$MASTER_ROOT/$rel" "$TARGET_ROOT/$rel"; then
    copy_one "$rel"
  fi
done < <(collect_guarded)

[ -n "$BACKUP_DIR" ] && printf 'BACKUP|%s\n' "$BACKUP_DIR"

# settings.json: hooks do mestre no alvo (3.4.12) + allowlist por uniao (3.4.23) — no --apply;
# no --dry-run so anuncia. Uma escrita so, com backup antes.
if [ "$SET_DIFF" -gt 0 ]; then
  if [ "$MODE" = "--apply" ]; then
    [ -f "$TARGET_ROOT/.claude/settings.json" ] && { mkdir -p "${BACKUP_DIR:-$TARGET_ROOT/.claude/.harness-run/sync-backup/settings}/.claude" 2>/dev/null; cp -p "$TARGET_ROOT/.claude/settings.json" "${BACKUP_DIR:-$TARGET_ROOT/.claude/.harness-run/sync-backup/settings}/.claude/settings.json" 2>/dev/null; }
    SET_APL="$(sync_settings apply)"; printf '%s\n' "$SET_APL"
    while IFS= read -r sl; do
      case "$sl" in SETTINGS\|*\|atualizado*|SETTINGS\|*\|criado*) COP=$((COP+1)) ;; esac
    done <<EOF_APL
$SET_APL
EOF_APL
  else
    SET_SEC=""
    case "$SET_LINHA" in *"SETTINGS|hooks|difere"*) SET_SEC="hooks" ;; esac
    case "$SET_LINHA" in *"SETTINGS|permissions|difere"*) SET_SEC="${SET_SEC:+$SET_SEC+}permissions (uniao)" ;; esac
    printf 'COPIARIA|.claude/settings.json (secao %s)\n' "$SET_SEC"
  fi
fi

# 3.5.7: migracao das decisoes do harness que o projeto declarava com o MESMO valor do default — a linha vira
# comentario marcado `[3.5.7 migrado: decisao do harness em hooks/_defaults.env]`; valor diferente = override
# consciente, preservado (ENV|override-preservado). Backup do harness.env junto com os demais substituidos.
if [ "$ENV_MIGRAVEIS" -gt 0 ]; then
  if [ "$MODE" = "--apply" ]; then
    [ -n "$BACKUP_DIR" ] || BACKUP_DIR="$TARGET_ROOT/.claude/.harness-run/sync-backup/$(date +%Y%m%d-%H%M%S)"
    ENV_APL="$("$SYNC_NODE" "$MASTER_ROOT/.claude/hooks/harness-env.mjs" --drift "$TARGET_ROOT" --apply --backup "$BACKUP_DIR" 2>/dev/null | grep -E '^ENV\|(migrada|preenchida|override-preservado|resumo)\|')"
    [ -n "$ENV_APL" ] && printf '%s\n' "$ENV_APL"
    printf 'COPIADO|.claude/harness.env (%s chave(s): decisao igual ao default comentada e/ou OPENROUTER_API_KEY preenchida da maquina)\n' "$ENV_MIGRAVEIS"
    COP=$((COP + 1))
  else
    printf 'COPIARIA|.claude/harness.env (%s chave(s): decisao igual ao default a comentar e/ou OPENROUTER_API_KEY a preencher da maquina)\n' "$ENV_MIGRAVEIS"
    COP=$((COP + 1))
  fi
fi

if [ "$MODE" = "--dry-run" ]; then
  printf 'RESUMO|ensaio|copiaria=%s\n' "$COP"
  if [ $((DIFF + MISS)) -gt 0 ]; then exit 10; else exit 0; fi
fi

# Atualiza SO a linha de versao (e HARNESS_TARGETS quando aplicavel) no harness.env
# do alvo — preserva o resto. NAO usar 'sed -i' (diverge GNU/BSD; bug real no Mac).
envf="$TARGET_ROOT/.claude/harness.env"
if [ ! -f "$envf" ]; then
  # Alvo sem harness.env: cria um minimo p/ o carimbo nao se perder (2.0.0 — antes
  # a versao simplesmente nao era registrada e o repo parecia "sem versao" p/ sempre).
  {
    printf '# .claude/harness.env — criado pelo harness-sync (minimo; ver mestre p/ o template completo)\n'
    printf '%s\n' "${mver:-HARNESS_VERSION='?'}"
  } > "$envf" 2>/dev/null && printf 'VERSAO_CRIADA|%s\n' "${mver:-?}"
elif [ -n "$mver" ]; then
  if grep -q '^HARNESS_VERSION' "$envf"; then
    tmpf="$(mktemp)"
    if [ -n "$tmpf" ] && sed "s|^HARNESS_VERSION=.*|$mver|" "$envf" > "$tmpf" && cat "$tmpf" > "$envf"; then
      printf 'VERSAO_ATUALIZADA|%s\n' "$mver"
    else
      printf 'ERRO|falha ao atualizar HARNESS_VERSION em %s\n' "$envf"
    fi
    rm -f "$tmpf"
  else
    printf '%s\n' "$mver" >> "$envf"
    printf 'VERSAO_ATUALIZADA|%s\n' "$mver"
  fi
fi

# Registra as superficies instaladas (HARNESS_TARGETS) quando o apply foi codex/all.
if [ "$WANT_CODEX" = "1" ] && [ -f "$envf" ]; then
  NEWT="claude,codex"
  if grep -q '^HARNESS_TARGETS=' "$envf" 2>/dev/null; then
    CURT="$(grep '^HARNESS_TARGETS=' "$envf" | head -1 | cut -d= -f2- | tr -d "'\"[:space:]")"
    case ",$CURT," in
      *,codex,*) : ;;   # ja registrado
      *)
        tmpf="$(mktemp)"
        if [ -n "$tmpf" ] && sed "s|^HARNESS_TARGETS=.*|HARNESS_TARGETS='$NEWT'|" "$envf" > "$tmpf" && cat "$tmpf" > "$envf"; then
          printf 'TARGETS_ATUALIZADOS|%s\n' "$NEWT"
        fi
        rm -f "$tmpf"
        ;;
    esac
  else
    printf "HARNESS_TARGETS='%s'\n" "$NEWT" >> "$envf"
    printf 'TARGETS_ATUALIZADOS|%s\n' "$NEWT"
  fi
fi

printf 'RESUMO|aplicado|copiados=%s erros=%s\n' "$COP" "$ERR"

# Lembrete de onboarding: atualizar nucleo pode trazer decisoes novas para o dev.
# (linha informativa — o consumidor /deus deve repassa-la no painel)
if [ "$COP" -gt 0 ]; then
  old_v="$(printf '%s' "${tver:-}" | cut -d"'" -f2)"
  new_v="$(printf '%s' "${mver:-}" | cut -d"'" -f2)"
  printf 'ONBOARDING|%s -> %s|revise .claude/ONBOARDING.md, secao "Decisoes por versao" (faixa pulada), e rode o harness-doctor.sh\n' \
    "${old_v:-?}" "${new_v:-?}"
fi
if [ "$CONF" -gt 0 ]; then
  printf 'ONBOARDING|conflito|%s arquivo(s) guardado(s) preservado(s) (sem marcador %s) — mesclar manualmente; ver ONBOARDING 2.0.0\n' "$CONF" "$GUARD_MARK"
fi
exit 0
