#!/usr/bin/env bash
# .claude/hooks/_env.sh (3.5.7) — CARREGADOR UNICO das camadas de configuracao do harness (bash).
# Sourced por todo hook/helper .sh:   . "$SCRIPT_DIR/_env.sh"     (SCRIPT_DIR = a pasta hooks)
# Paridade com o lado Node: presence.mjs -> loadHarnessEnv() le os MESMOS arquivos na MESMA ordem.
#
# ORDEM DE CARGA (a ultima que define vence; a variavel de AMBIENTE da sessao vence todas):
#   1. hooks/_defaults.env        decisao do HARNESS (versionado no mestre, viaja no sync) — UNICO lugar
#   2. .claude/harness.env        chaves do PROJETO (lista fechada em hooks/_camadas.txt)
#   3. .claude/harness.env.local  maquina (gitignored)
#   4. ~/.harness.env.local       usuario/maquina, todos os projetos (chmod 600)
#   5. ambiente da sessao         HARNESS_DELEGATE_MODE=economia claude  (virada pontual, nunca versionada)
# Antes da 3.5.7 cada hook tinha o proprio loop (14 variantes: uns liam so o harness.env, outros pulavam o
# ~/.harness.env.local, nenhum lia o _defaults.env alem do duelo/delegate/daemon) e o `source` do bash deixava
# o ARQUIVO vencer o ambiente — ao contrario do que o harness.env.local.example documentava.
#
# Sem fork: nada de $(...) aqui — este arquivo roda a cada Bash/Edit/Write de subagente (a criacao de processo
# nesta maquina e serializada, ~20/s). ${!HARNESS_*} lista as variaveis do ambiente sem processo novo.
#
# Funcoes exportadas ao chamador:
#   harness_env_origem KEY   -> defaults | projeto | local | maquina | ambiente | codigo   (camada que DEFINE a chave)
#   harness_env_arquivos     -> imprime os 4 caminhos, um por linha (na ordem de carga)
# Variaveis: HARNESS_ENV_CLAUDE_DIR (opcional, antes do source) aponta outro .claude — usado pelo doctor/sync
# ao inspecionar um alvo; HARNESS_ENV_TRACE=1 imprime no stderr o que foi carregado.

_HE_HOOKS_DIR="${BASH_SOURCE[0]%/*}"
[ "$_HE_HOOKS_DIR" = "${BASH_SOURCE[0]}" ] && _HE_HOOKS_DIR="."
_HE_CLAUDE_DIR="${HARNESS_ENV_CLAUDE_DIR:-$_HE_HOOKS_DIR/..}"
_HE_FILES_DEFAULTS="$_HE_HOOKS_DIR/_defaults.env"
_HE_FILES_PROJETO="$_HE_CLAUDE_DIR/harness.env"
_HE_FILES_LOCAL="$_HE_CLAUDE_DIR/harness.env.local"
_HE_FILES_MAQUINA="${HOME:-${USERPROFILE:-}}/.harness.env.local"

harness_env_arquivos() {
  printf '%s\n' "$_HE_FILES_DEFAULTS" "$_HE_FILES_PROJETO" "$_HE_FILES_LOCAL" "$_HE_FILES_MAQUINA"
}

# 1) foto do AMBIENTE (o que a sessao/CI definiu vence os arquivos) — sem processo novo
_HE_KEEP=""
for _he_k in ${!HARNESS_*} OPENROUTER_API_KEY ANTHROPIC_API_KEY; do
  case "$_he_k" in _HE_*|HARNESS_ENV_*) continue ;; esac
  if [ -n "${!_he_k+x}" ]; then
    printf -v "_HE_SAVED_$_he_k" '%s' "${!_he_k}"
    _HE_KEEP="$_HE_KEEP $_he_k"
  fi
done

# 2) camadas, na ordem
for _he_f in "$_HE_FILES_DEFAULTS" "$_HE_FILES_PROJETO" "$_HE_FILES_LOCAL" "$_HE_FILES_MAQUINA"; do
  if [ -f "$_he_f" ]; then
    # shellcheck disable=SC1090
    . "$_he_f"
    [ -n "${HARNESS_ENV_TRACE:-}" ] && printf '[_env] carregado %s\n' "$_he_f" >&2
  fi
done

# 3) ambiente vence
for _he_k in $_HE_KEEP; do
  _he_v="_HE_SAVED_$_he_k"
  printf -v "$_he_k" '%s' "${!_he_v}"
done
unset _he_k _he_v _he_f

# Camada que DEFINE a chave (linha ativa `KEY=` / `export KEY=`), a ultima na ordem de carga vence.
# Ambiente: a chave estava na foto do passo 1. Sem definicao em lugar nenhum => 'codigo' (default do script).
harness_env_origem() { # $1 = KEY
  local k="$1" f ori="codigo" l cam
  case " $_HE_KEEP " in *" $k "*) printf 'ambiente\n'; return 0 ;; esac
  for cam in defaults projeto local maquina; do
    case "$cam" in
      defaults) f="$_HE_FILES_DEFAULTS" ;; projeto) f="$_HE_FILES_PROJETO" ;;
      local) f="$_HE_FILES_LOCAL" ;; maquina) f="$_HE_FILES_MAQUINA" ;;
    esac
    [ -f "$f" ] || continue
    while IFS= read -r l || [ -n "$l" ]; do
      case "$l" in "$k="*|"export $k="*) ori="$cam" ;; esac
    done < "$f"
  done
  printf '%s\n' "$ori"
}
