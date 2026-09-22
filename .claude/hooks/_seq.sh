#!/usr/bin/env bash
# .claude/hooks/_seq.sh — FAIXAS DE NUMERACAO POR DEV (3.5.0). Helper compartilhado (prefixo "_" => nao e
# hook; e dado source pelo harness-worktree.sh reservar, pelo doctor e por quem precisar).
#
# POR QUE EXISTE. A reserva atomica (harness-worktree.sh reservar, 3.4.2/3.4.32/3.4.33) resolve a colisao
# entre checkouts da MESMA maquina (o registro vive no .git comum). Entre DEVS ela nao alcanca: cada um
# reserva no proprio .git, dois PRD-142 (ou DT-581, LOTE-040) nascem em maquinas diferentes e so se
# encontram no merge — e renumerar arquivo + INDEX + referencias custa mais que uma PRD pequena. Pedido
# da equipe (11/09/2026): numero DIFERENTE por dev, sem coordenacao e sem rede.
#
# REGRA. Cada dev tem um BLOCO por serie. Bloco k => numeros k*T+1 .. (k+1)*T-1 (T = tamanho da faixa).
# O bloco 0 e a serie LEGADA (1..T-1): continua com quem sempre numerou e nada existente muda de nome.
# O piso de cada dev e o maior numero JA VISTO DENTRO DA PROPRIA FAIXA (+ reservas) — numeros de outra
# faixa nao entram na conta. Buraco na serie e ok; colisao nao e. NUNCA renumere para "fechar buraco".
# A chave e o e-mail do git (`git config user.email` do checkout) — a mesma identidade do campo `autor`
# da telemetria (prds/_metrics/runs/). Dev com dois e-mails (PC/Mac) declara os dois no mesmo bloco.
#
#   HARNESS_SEQ_FAIXAS         csv chave=bloco. Vazio => tabela DEFAULT abaixo (equipe Beta). Declarado
#                              => SUBSTITUI a tabela inteira. 'off' => sem faixas (serie unica, como ate a
#                              3.4.34). Repita a chave para dar um 2o bloco ao mesmo dev (faixa esgotada).
#   HARNESS_SEQ_FAIXAS_EXTRA   csv chave=bloco ACRESCENTADO a tabela em vigor (dev externo de UM projeto).
#   HARNESS_SEQ_FAIXA_TAMANHO  T. '1000' (todas as series) ou por serie 'PRD=1000,DT=10000,LOTE=1000'.
#                              Default: DT=10000 (a serie que mais cresce — DT-580 no Mariana em 2 meses),
#                              demais 1000. NAO mude num projeto que ja numerou com faixas: os blocos
#                              existentes deixariam de ser disjuntos.
#   HARNESS_SEQ_FAIXAS_SERIES  quais series usam faixa (default 'PRD,DT,LOTE'). MIG NUNCA usa faixa:
#                              migration precisa de ORDEM DE CRIACAO (banco zero aplica por nome, em ordem)
#                              e uma particao estatica da reta numerica quebra isso — ver
#                              HARNESS_MIG_NUMERACAO ('seq' | 'timestamp') no harness.env.
#
# Uso (apos source; o chamador ja carregou harness.env):
#   harness_seq_faixa <SERIE> [root]   -> 0..n linhas "ini|fim|bloco|chave" (vazio = serie sem faixa/off);
#                                         dev sem faixa => bloco 0 + AVISO em stderr (serie compartilhada)
#   harness_seq_identidade [root]      -> e-mail git em minusculas (vazio se nao configurado)
#   harness_seq_tamanho <SERIE>        -> T
#   harness_seq_tabela                 -> a tabela em vigor, uma linha "chave=bloco" por entrada
# Nunca falha o chamador (return 0 sempre).

# Tabela DEFAULT (equipe Beta, e-mails como aparecem no git log dos repos — 11/09/2026). Bloco 0 = legado.
HARNESS_SEQ_FAIXAS_DEFAULT='charlesegundo@gmail.com=0,charlessegundo@betasistemas.com=0,derickjesiel96@gmail.com=1,deboradeoliveira2003@gmail.com=2,giovannyporto@gmail.com=3,joaonetovhc@gmail.com=4'

harness_seq_identidade() { # $1 = raiz (default .) -> e-mail git (minusculas, sem espaco)
  git -C "${1:-.}" config user.email 2>/dev/null | head -1 | tr -d '\r[:space:]' | tr 'A-Z' 'a-z'
  return 0
}

harness_seq_tabela() { # -> linhas chave=bloco (default OU HARNESS_SEQ_FAIXAS) + HARNESS_SEQ_FAIXAS_EXTRA
  local tab="${HARNESS_SEQ_FAIXAS:-}" extra="${HARNESS_SEQ_FAIXAS_EXTRA:-}" item k v
  [ "$tab" = "off" ] && return 0
  [ -n "$tab" ] || tab="$HARNESS_SEQ_FAIXAS_DEFAULT"
  printf '%s
' "$tab${extra:+,$extra}" | tr ';' ',' | tr ',' '\n' | while IFS= read -r item; do
    k="$(printf '%s' "${item%%=*}" | tr -d '[:space:]' | tr 'A-Z' 'a-z')"; v="$(printf '%s' "${item#*=}" | tr -d '[:space:]')"
    [ -n "$k" ] && [ "$item" != "$k" ] || continue
    case "$v" in ''|*[!0-9]*) continue ;; esac
    printf '%s=%s\n' "$k" "$((10#$v))"
  done
  return 0
}

harness_seq_tamanho() { # $1 = serie -> T (inteiro)
  local s="$1" spec="${HARNESS_SEQ_FAIXA_TAMANHO:-}" t="" item k v
  s="$(printf '%s' "$s" | tr 'a-z' 'A-Z')"
  case "$spec" in
    '') spec='DT=10000' ;;
    *[!0-9]*) : ;;
    *) t="$spec" ;;
  esac
  if [ -z "$t" ]; then
    t="$(printf '%s
' "$spec" | tr ';' ',' | tr ',' '\n' | while IFS= read -r item; do
      k="$(printf '%s' "${item%%=*}" | tr -d '[:space:]' | tr 'a-z' 'A-Z')"; v="$(printf '%s' "${item#*=}" | tr -d '[:space:]')"
      [ "$k" = "$s" ] || continue
      case "$v" in ''|*[!0-9]*) continue ;; esac
      printf '%s' "$((10#$v))"; break
    done)"
  fi
  case "$t" in ''|*[!0-9]*|0) if [ "$s" = DT ]; then t=10000; else t=1000; fi ;; esac
  printf '%s' "$t"
  return 0
}

harness_seq_faixa() { # $1 = serie  $2 = raiz -> linhas "ini|fim|bloco|chave" (0..n); vazio = sem faixa
  local s="$1" root="${2:-.}" series="${HARNESS_SEQ_FAIXAS_SERIES:-PRD,DT,LOTE}" id t found=0 linha k v tabela
  s="$(printf '%s' "$s" | tr 'a-z' 'A-Z')"
  [ "${HARNESS_SEQ_FAIXAS:-}" = "off" ] && return 0
  [ "$s" = MIG ] && return 0
  case ",$(printf '%s' "$series" | tr -d '[:space:]' | tr 'a-z' 'A-Z')," in *,"$s",*) : ;; *) return 0 ;; esac
  id="$(harness_seq_identidade "$root")"
  t="$(harness_seq_tamanho "$s")"
  tabela="$(harness_seq_tabela)"
  if [ -n "$id" ] && [ -n "$tabela" ]; then
    while IFS= read -r linha; do
      [ -n "$linha" ] || continue
      k="${linha%%=*}"; v="${linha#*=}"
      [ "$k" = "$id" ] || continue
      found=1; printf '%s|%s|%s|%s\n' "$(( v * t + 1 ))" "$(( (v + 1) * t - 1 ))" "$v" "$k"
    done <<EOT
$tabela
EOT
  fi
  [ "$found" = 1 ] && return 0
  # dev sem faixa (ou sem e-mail git): bloco 0 = serie compartilhada legada. Aviso, nunca bloqueio.
  printf '1|%s|0|%s\n' "$(( t - 1 ))" "${id:-sem-email}"
  printf '[seq] AVISO: dev "%s" sem faixa na serie %s — usando o bloco 0 (serie compartilhada; colisao com outro dev sem faixa e possivel). Declare no .claude/harness.env: HARNESS_SEQ_FAIXAS_EXTRA=%s=<bloco livre> (tabela em vigor: bash .claude/hooks/harness-worktree.sh faixa)\n' "${id:-sem-email}" "$s" "${id:-email@git}" >&2
  return 0
}
