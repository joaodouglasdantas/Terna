#!/usr/bin/env bash
# .claude/hooks/perfil-doctor.sh (3.4.3) — DERIVA DE PERFIL detectada, nao sofrida.
# Compara o PERFIL-PROJETO.md deste projeto com a ESTRUTURA CANONICA do template do mestre
# (secoes + campos que as skills e a tela leem — espelho do PERFIL_MAP do harness-ui.mjs):
#   SECAO-AUSENTE|<secao>      a secao inteira nao existe
#   FALTA|<secao>|<campo>      linha inexistente (subagente vai ler suposicao)
#   VAZIO|<secao>|<campo>      linha existe mas o valor e placeholder `<...>`/vazio
# Matching TOLERANTE (acentos normalizados, parentetico ignorado) — o falso "13 campos vazios"
# de 23/08 no dra-mariana-duarte nasceu de comparacao literal.
#   bash .claude/hooks/perfil-doctor.sh [--resumo]
# Read-only; exit 0 sempre. Implementado em node (acentos/tabelas com seguranca).

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PERFIL="$SCRIPT_DIR/../PERFIL-PROJETO.md"
[ -f "$PERFIL" ] || { echo "RESUMO|sem-perfil"; exit 0; }
NODE="${HARNESS_RAG_NODE:-node}"
command -v "$NODE" >/dev/null 2>&1 || { echo "RESUMO|sem-node"; exit 0; }
"$NODE" -e '
const fs = require("fs");
const perfil = fs.readFileSync(process.argv[1], "utf8");
const resumoSo = process.argv[2] === "--resumo";
const norm = (s) => s.toLowerCase()
  .replace(/[áàâã]/g,"a").replace(/[éê]/g,"e").replace(/í/g,"i").replace(/[óôõ]/g,"o").replace(/[úü]/g,"u").replace(/ç/g,"c")
  .replace(/\([^)]*\)/g," ").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
// canonico: [secao, [campos...]] — campos [] = basta a secao existir.
const CANON = [
  ["Identificacao", ["Nome do projeto","Stack resumida"]],
  ["CLI", ["Interpretador (run/lint)"]],
  ["Banco de dados", ["SGBD","Host","Database","Usuario","Senha","Comando de smoke test"]],
  ["Aplicacao", ["Base URL local","Base URL da API"]],
  ["Testes E2E", ["Framework"]],
  ["Safe Mode", ["Whitelist (se aplicavel)"]],
  ["Codex review", ["Limite de ciclos","Reasoning do Codex","Piso de severidade do review"]],
  ["Manual vivo", ["Mecanismo"]],
  ["Nivel de esforco", ["Preset de esforco","Esforco — fase pensar","Esforco — fase executar"]],   // 3.5.3: esforco por fase
  ["Agentes do harness", ["Modelo do sherlock","Modelo do beholder","Modelo do michelangelo","Modelo do dedalo",
    "Modelo do sherlock nos ciclos de refino","Modelo dos gates nos ciclos de refino","Ciclos do beholder","Ciclos do michelangelo"]],
  ["Economia e controle", ["Modo de delegacao"]],
  ["Plataformas", ["Superficies instaladas","Revisor externo do review"]],
  ["Worktrees", []],
  ["Compatibilidade", []],
  ["Timezone", []],
  ["Estrutura de diretorios", []],
  ["Armadilhas do projeto", []],
];
const linhas = perfil.split(/\r?\n/);
const secoes = []; // {norm, ini, fim}
linhas.forEach((l, i) => { const m = l.match(/^##\s+(.+?)\s*$/); if (m) { if (secoes.length) secoes[secoes.length-1].fim = i-1; secoes.push({ norm: norm(m[1]), ini: i, fim: linhas.length-1 }); } });
const achaSecao = (sn) => secoes.find((s) => s.norm.startsWith(sn) || sn.startsWith(s.norm.split(" ").slice(0,2).join(" ")) && s.norm.includes(sn.split(" ")[0]));
let faltas = 0, vazios = 0, ausentes = 0; const out = [];
for (const [sec, campos] of CANON) {
  const sn = norm(sec);
  const s = secoes.find((x) => x.norm.startsWith(sn));
  if (!s) { ausentes++; out.push("SECAO-AUSENTE|" + sec); continue; }
  for (const campo of campos) {
    const cn = norm(campo);
    let linha = null;
    for (let i = s.ini + 1; i <= s.fim; i++) {
      const m = linhas[i].match(/^\|\s*\*\*(.+?)\*\*\s*\|(.*)$/);
      if (m && norm(m[1]) === cn) { linha = m; break; }
    }
    if (!linha) { faltas++; out.push("FALTA|" + sec + "|" + campo); continue; }
    const val = (linha[2].split("|")[0] || "").trim();
    const grupos = [...val.matchAll(/`([^`]*)`/g)].map((g) => g[1]);
    const efetivo = grupos.length ? (grupos[0].startsWith("<") ? "" : grupos[0]) : val;
    if (!efetivo.trim()) { vazios++; out.push("VAZIO|" + sec + "|" + campo); }
  }
}
if (!resumoSo) out.forEach((l) => console.log(l));
console.log(`RESUMO|faltas=${faltas} vazios=${vazios} secoes_ausentes=${ausentes}`);
if (!resumoSo && (faltas + vazios + ausentes) > 0)
  console.log("(complete pela tela /harness-config, aba Perfil — ou copie as linhas do template do mestre; deriva de Perfil = subagente lendo suposicao)");
' "$PERFIL" "${1:-}"
exit 0
