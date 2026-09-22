#!/usr/bin/env bash
# .claude/hooks/perfil-frescor.sh (2.15.0)
# O PERFIL-RESUMO.md esta em dia com o PERFIL-PROJETO.md?
#
# POR QUE EXISTE. Todo subagente le o RESUMO, nao o Perfil (regra 2.4.0) — e resumo
# defasado e a pior falha possivel do harness: silenciosa e confiante. Ate a 2.14.0 a
# unica checagem era mtime (harness-doctor), que MENTE em toda maquina: `git checkout`
# carimba a hora do checkout, em ordem arbitraria — um resumo perfeito aparece como
# defasado e um defasado aparece como fresco. Aqui a verdade e a IMPRESSAO DIGITAL do
# Perfil, carimbada dentro do proprio resumo quando ele foi gerado.
#
# Uso:
#   bash .claude/hooks/perfil-frescor.sh             # verifica (veredito no stdout)
#   bash .claude/hooks/perfil-frescor.sh --carimbar  # grava/atualiza o carimbo (+ check de coerencia em stderr)
#   bash .claude/hooks/perfil-frescor.sh --hash      # so imprime o hash atual do Perfil
#   bash .claude/hooks/perfil-frescor.sh --coerencia # DT-008: so o detector de redacao empilhada (pos-merge)
#
# Saida (stdout, 1 linha): "<STATUS>|<detalhe>"
#   FRESCO      | o carimbo bate com o Perfil atual
#   DEFASADO    | o Perfil mudou desde a geracao do resumo  -> REGERE o resumo
#   SEM-CARIMBO | resumo existe mas nunca foi carimbado     -> confira e carimbe
#   SEM-RESUMO  | nao ha resumo (subagentes leem o Perfil inteiro)
#   SEM-PERFIL  | nao ha Perfil (o projeto nao esta portado)
# Exit: 0 FRESCO/SEM-PERFIL · 3 DEFASADO · 4 SEM-CARIMBO · 5 SEM-RESUMO
# (exit != 0 NUNCA e erro fatal — e sinal para a skill agir; nada aqui bloqueia nada.)
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PERFIL="$CLAUDE_DIR/PERFIL-PROJETO.md"
RESUMO="$CLAUDE_DIR/PERFIL-RESUMO.md"
# Prefixo EXATO da linha do carimbo. Precisa ser especifico: uma marca curta como
# "Sincronizado com o Perfil" tambem casa com prosa que CITE o carimbo, e o --carimbar
# sobrescreveria a explicacao (aconteceu ao escrever esta versao). Alem do prefixo
# exato, o awk substitui SO a primeira ocorrencia.
MARCA='> **Sincronizado com o Perfil:**'

# Impressao digital do Perfil. cksum e POSIX (existe no Git Bash, macOS e Linux) e
# nao depende de sha1sum/shasum, que variam de nome entre plataformas. Normalizamos
# CRLF -> LF antes: em checkout Windows (core.autocrlf) o MESMO conteudo teria hash
# diferente do da maquina que gerou o resumo, e todo mundo apareceria "defasado".
hash_perfil() {
  [ -f "$PERFIL" ] || return 1
  tr -d '\r' < "$PERFIL" | cksum | tr -d ' \n'
}

MODO="${1:-}"

# ---------------------------------------------------------------------------
# Coerencia INTERNA do derivado (DT-008, 01/09/2026). O carimbo prova UMA
# garantia: "o resumo foi regenerado depois da ultima mudanca do Perfil". Ele
# NAO prova a segunda, diferente: "o resumo esta internamente coerente" — e o
# auto-merge de N branches quebra a segunda sem tocar na primeira (caso real
# 01/09: 3 redacoes do mesmo storage state empilhadas, carimbo FRESCO, so a
# auditoria manual achou). Heuristica validada em campo pela sessao PRD-134:
# um PAR de itens de lista que compartilha 3+ termos entre crases = provaveis
# redacoes da MESMA informacao ("um termo em N itens" nao serve: `NULL` em 4
# itens de um resumo tecnico e normal — medido, dava 9 falsos positivos).
# AVISO em STDERR (o contrato de stdout — 1 linha de veredito — fica intacto);
# nunca bloqueia nada. Par COMPLEMENTAR legitimo existe (storage fora de spec
# x login dentro de spec compartilham 2 termos) — por isso o piso e 3. Mesmo
# assim sobra falso positivo (~4 num resumo tecnico denso: itens vizinhos de
# ACL compartilham 3 termos legitimamente), entao o check RODA SO no --carimbar
# (o ato de consolidar — 30s de leitura no momento certo) e no --coerencia
# avulso; na verificacao rotineira ele viraria alarme cronico banalizado.
checar_redacao_empilhada() {
  [ -f "$RESUMO" ] || return 0
  awk '
    /^[ \t]*[-*] / {
      ni++; lin[ni] = NR; termos[ni] = ""
      s = $0
      while (match(s, /`[^`]{4,80}`/)) {
        t = substr(s, RSTART + 1, RLENGTH - 2)
        if (index("\x1f" termos[ni], "\x1f" t "\x1f") == 0) termos[ni] = termos[ni] t "\x1f"
        s = substr(s, RSTART + RLENGTH)
      }
    }
    END {
      for (a = 1; a < ni; a++) for (b = a + 1; b <= ni; b++) {
        na = split(termos[a], A, "\x1f"); comum = 0; lista = ""
        for (k = 1; k <= na; k++) {
          if (A[k] == "") continue
          if (index("\x1f" termos[b], "\x1f" A[k] "\x1f") > 0) { comum++; lista = lista A[k] ", " }
        }
        if (comum >= 3)
          printf "DERIVADO|redacao-empilhada|linhas %d e %d compartilham %d termos (%s) — provaveis redacoes da MESMA informacao; consolide antes de recarimbar\n", lin[a], lin[b], comum, substr(lista, 1, length(lista) - 2)
      }
    }
  ' "$RESUMO" >&2
}

if [ ! -f "$PERFIL" ]; then
  echo "SEM-PERFIL|sem .claude/PERFIL-PROJETO.md — projeto nao portado (nada a fazer)"
  exit 0
fi

H="$(hash_perfil)"
if [ "$MODO" = "--hash" ]; then
  echo "$H"
  exit 0
fi

# --- coerencia avulsa (DT-008): so o detector, para auditoria pos-merge -------
if [ "$MODO" = "--coerencia" ]; then
  checar_redacao_empilhada
  echo "COERENCIA|avisos (se houver) acima, em stderr — par legitimo se descarta lendo"
  exit 0
fi

# --- carimbar: grava a linha de sincronia no topo do resumo -------------------
if [ "$MODO" = "--carimbar" ]; then
  if [ ! -f "$RESUMO" ]; then
    echo "SEM-RESUMO|nada a carimbar: gere o .claude/PERFIL-RESUMO.md primeiro"
    exit 5
  fi
  DATA="$(date +%Y-%m-%d 2>/dev/null || echo '?')"
  LINHA="${MARCA} \`${H}\` (${DATA}) — carimbo do \`perfil-frescor.sh\`; NAO edite a mao."
  TMP="$RESUMO.tmp.$$"
  if grep -qF "$MARCA" "$RESUMO" 2>/dev/null; then
    # substitui SO a primeira linha do carimbo, preservando o resto intacto
    awk -v marca="$MARCA" -v nova="$LINHA" '
      !feito && index($0, marca) == 1 { print nova; feito=1; next } { print }
    ' "$RESUMO" > "$TMP" 2>/dev/null && cat "$TMP" > "$RESUMO" && rm -f "$TMP"
  else
    # insere logo apos o titulo (1a linha) — fica visivel para quem abre o arquivo
    awk -v nova="$LINHA" 'NR==1 { print; print ""; print nova; next } { print }' \
      "$RESUMO" > "$TMP" 2>/dev/null && cat "$TMP" > "$RESUMO" && rm -f "$TMP"
  fi
  rm -f "$TMP" 2>/dev/null
  checar_redacao_empilhada   # DT-008: quem carimba um derivado incoerente ve o aviso na hora
  echo "FRESCO|carimbado agora: $H"
  exit 0
fi

# --- verificar ----------------------------------------------------------------
if [ ! -f "$RESUMO" ]; then
  PB="$(wc -c < "$PERFIL" 2>/dev/null | tr -d '[:space:]')"
  echo "SEM-RESUMO|Perfil de ${PB:-?} B lido INTEIRO por todo subagente — gere o destilado"
  exit 5
fi

CARIMBO="$(grep -F "$MARCA" "$RESUMO" 2>/dev/null | head -n1 | grep -o '`[0-9]*`' | tr -d '`' | head -n1)"
if [ -z "$CARIMBO" ]; then
  echo "SEM-CARIMBO|resumo sem carimbo de sincronia — confira se bate com o Perfil e rode --carimbar"
  exit 4
fi
if [ "$CARIMBO" = "$H" ]; then
  echo "FRESCO|resumo em dia com o Perfil ($H)"
  exit 0
fi
echo "DEFASADO|Perfil mudou desde a geracao do resumo (carimbo $CARIMBO, atual $H) — REGERE o resumo"
exit 3
