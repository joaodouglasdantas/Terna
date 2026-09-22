#!/usr/bin/env bash
# .claude/scripts/gen-adapters.sh (2.0.0)
# Gera DETERMINISTICAMENTE os adapters Codex a partir da fonte canonica:
#   .claude/skills/<n>/SKILL.md  ->  .agents/skills/<n>/SKILL.md   (stub fino)
# e VALIDA a paridade dos agentes (.claude/agents/<n>.md <-> .codex/agents/<n>.toml).
# Sem symlinks (portabilidade Windows/macOS): o stub e um arquivo gerado, com
# marcador — o harness-sync o propaga por copia e o doctor acusa drift.
#
# Uso:  bash .claude/scripts/gen-adapters.sh [--check]
#   (sem flag) gera/atualiza os stubs; --check so verifica (exit 1 se drift).
#
# Regra de ouro: NUNCA edite um stub gerado — edite o canonico e re-rode isto.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"    # .../.claude/scripts
CLAUDE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"                    # .../.claude
ROOT="$(cd "$CLAUDE_DIR/.." && pwd)"                          # raiz do repo
SKILLS_SRC="$CLAUDE_DIR/skills"
SKILLS_OUT="$ROOT/.agents/skills"
AGENTS_SRC="$CLAUDE_DIR/agents"
AGENTS_TOML="$ROOT/.codex/agents"

MODE="${1:-}"
CHECK=0
[ "$MODE" = "--check" ] && CHECK=1
RC=0

# Extrai um campo do frontmatter YAML simples (name:/description: na 1a secao ---).
fm_field() { # $1=arquivo $2=campo
  awk -v k="$2" '
    NR==1 && $0=="---" { fm=1; next }
    fm && $0=="---" { exit }
    fm && index($0, k":")==1 {
      v=substr($0, length(k)+2)
      sub(/^[[:space:]]*/, "", v); sub(/[[:space:]]*$/, "", v)
      gsub(/^"|"$/, "", v)
      print v; exit
    }
  ' "$1" 2>/dev/null
}

# --- Stubs de skills ---------------------------------------------------------
# Skills de TERCEIRO versionadas em .claude/skills (2.9.0: ui-ux-pro-max) nao ganham
# stub Codex: quem as usa (dedalo/ariadne) roda o script direto, sem passar pelo
# mecanismo de skills do host — e o stub so duplicaria uma description gigante.
THIRD_PARTY_SKILLS="ui-ux-pro-max"

is_third_party() { # $1=nome da skill
  for t in $THIRD_PARTY_SKILLS; do [ "$t" = "$1" ] && return 0; done
  return 1
}

[ -d "$SKILLS_SRC" ] || { echo "[gen-adapters] sem $SKILLS_SRC" >&2; exit 1; }
for dir in "$SKILLS_SRC"/*/; do
  [ -d "$dir" ] || continue
  n="$(basename "$dir")"
  src="$dir/SKILL.md"
  [ -f "$src" ] || continue
  if is_third_party "$n"; then
    [ "$CHECK" = "1" ] || echo "[gen-adapters] skill de terceiro (sem stub): $n"
    continue
  fi
  # so geramos stub para skill COM frontmatter name== nome da pasta (as do harness).
  NAME="$(fm_field "$src" name)"
  DESC="$(fm_field "$src" description)"
  if [ -z "$NAME" ] || [ -z "$DESC" ]; then
    echo "[gen-adapters] AVISO: $src sem frontmatter name/description — stub NAO gerado (adicione o frontmatter ao canonico)." >&2
    RC=1
    continue
  fi
  if [ "$NAME" != "$n" ]; then
    echo "[gen-adapters] AVISO: name '$NAME' != pasta '$n' em $src — corrigir canonico." >&2
    RC=1
  fi
  out="$SKILLS_OUT/$n/SKILL.md"
  stub_content() {
    # 3.4.33b: aspas duplas DENTRO da description quebram o YAML do stub (Codex: 'invalid YAML ... column 378' na
    # prometeu, 10/09) — viram aspas simples; o canonico continua intacto.
    DESC="$(printf '%s' "$DESC" | tr '"' "'")"
    printf -- '---\nname: %s\ndescription: "%s"\n---\n\n' "$NAME" "$DESC"
    printf '<!-- GERADO por .claude/scripts/gen-adapters.sh — NAO EDITE (harness:managed).\n'
    printf '     Fonte canonica: .claude/skills/%s/SKILL.md -->\n\n' "$n"
    printf '# %s — adapter Codex\n\n' "$NAME"
    printf 'Este stub existe para o Codex descobrir a skill. O workflow canonico e um so:\n\n'
    printf '1. Leia `.claude/PLATAFORMAS.md` (equivalencias de ferramentas, subagentes e\n'
    printf '   eventos para executar o workflow neste runtime).\n'
    printf '2. Leia e siga INTEGRALMENTE `.claude/skills/%s/SKILL.md` — ele e a skill.\n' "$n"
    printf '   Onde o texto citar ferramenta/evento do Claude Code, aplique a tabela de\n'
    printf '   equivalencia do passo 1. O Perfil do Projeto continua a fonte de verdade.\n'
  }
  if [ "$CHECK" = "1" ]; then
    # Comparacao TOLERANTE a CRLF: em checkout Windows (core.autocrlf=true) o git
    # materializa CRLF no disco enquanto o stub e gerado com LF — o cmp byte-a-byte
    # acusava DRIFT falso nos 6 adapters em TODA maquina Windows (o conteudo e
    # identico). O $( ) tambem normaliza o newline final dos dois lados.
    if [ ! -f "$out" ] || [ "$(stub_content)" != "$(tr -d '\r' < "$out")" ]; then
      echo "[gen-adapters] DRIFT: $out desatualizado vs canonico (re-rode gen-adapters.sh)." >&2
      RC=1
    fi
  else
    mkdir -p "$(dirname "$out")"
    stub_content > "$out"
    echo "[gen-adapters] gerado: ${out#"$ROOT"/}"
  fi
done

# --- Paridade dos agentes (validacao — TOMLs sao mantidos a mao) -------------
CORE_AGENTS="beholder michelangelo tony-stark sherlock atlas hefesto peter-quill ariadne dedalo prometeu"
for a in $CORE_AGENTS; do
  md="$AGENTS_SRC/$a.md"
  toml="$AGENTS_TOML/$a.toml"
  [ -f "$md" ] || { echo "[gen-adapters] AVISO: canonico ausente: $md" >&2; RC=1; continue; }
  if [ ! -f "$toml" ]; then
    echo "[gen-adapters] AVISO: adapter Codex ausente: $toml (agente '$a' invisivel no Codex)." >&2
    RC=1
    continue
  fi
  # name = "<a>" presente no TOML?
  grep -Eq "^[[:space:]]*name[[:space:]]*=[[:space:]]*\"$a\"" "$toml" || {
    echo "[gen-adapters] AVISO: $toml sem name=\"$a\"." >&2; RC=1; }
  grep -Eq "^[[:space:]]*description[[:space:]]*=" "$toml" || {
    echo "[gen-adapters] AVISO: $toml sem description." >&2; RC=1; }
  grep -Eq "^[[:space:]]*developer_instructions[[:space:]]*=" "$toml" || {
    echo "[gen-adapters] AVISO: $toml sem developer_instructions." >&2; RC=1; }
  # o adapter deve apontar o canonico (regra anti-divergencia)
  grep -q ".claude/agents/$a.md" "$toml" || {
    echo "[gen-adapters] AVISO: $toml nao referencia o canonico .claude/agents/$a.md." >&2; RC=1; }
  # 3.4.25 (item 19): no Codex nao ha packet com a secao 0 — o adapter aponta o contrato mecanico do papel
  grep -q ".claude/contratos/CONTRATO-" "$toml" || {
    echo "[gen-adapters] AVISO: $toml nao referencia o contrato mecanico (.claude/contratos/CONTRATO-<papel>.md)." >&2; RC=1; }
done

[ "$RC" -eq 0 ] && echo "[gen-adapters] OK — adapters em dia com o canonico."
exit "$RC"
