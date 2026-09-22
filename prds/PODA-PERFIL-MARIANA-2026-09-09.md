# Poda do Perfil — dra-mariana-duarte (análise REAL, 2026-09-09)

> Gerado por `bash .claude/hooks/perfil-poda.sh --root C:/laragon/www/dra-mariana-duarte --md` (3.4.26) e
> **conferido à mão** (cada 🟢 seria aberto na linha; os 🟡 foram lidos um a um). **Nada foi aplicado no
> Mariana** — o `prds/_metrics/perfil-poda-2026-09-09.md` que o `--md` gravou lá foi removido (repo
> read-only nesta entrega); esta é a cópia curada. A decisão é do Charles (P2 do `/deus`).

## Resumo

| Métrica | Valor |
|---|---|
| Perfil hoje | **139 KB** (142.434 B, 954 linhas) · **256 entradas podáveis** em 7 seções |
| 🟢 morto-provado | **0 entradas · 0 KB** |
| 🟡 suspeito | **32 entradas · 28 KB** (todas por duplicata provável; 1 por identificador externo) |
| 🔴 intocável | **224 entradas** |
| KB estimado após 🟢 | **139 KB** (nada a podar com prova) |
| KB estimado após 🟢+🟡 | **111 KB** (teto teórico — se TODOS os 🟡 fossem consolidados; na prática ~8–12 KB) |
| Referências verificáveis vivas | **517** (caminhos, arquivos, `tabela.coluna`, funções, chaves) em 153 entradas — **nenhuma morta** |
| Entradas sem referência verificável | 102 (lição em prosa: "não use X", "sempre Y" — não há o que testar) |
| Carimbo de procedência | 104 com carimbo (62 de 2026-08, 42 de 2026-09) · **151 sem carimbo** (anteriores à 2.15.0) |

**Leitura em 5 linhas.**
1. O Perfil do Mariana **não tem entrada morta provável**: das 517 coisas que ele cita (arquivo, tabela, coluna, função, chave de `configuracoes`), **todas existem** no repo hoje — o script é capaz de achar morta (suíte prova com caminho inexistente, coluna sem migration, PRD revertida), e no Mariana não achou nenhuma.
2. O peso não é de fóssil, é de **densidade recente**: 104 carimbos, todos de ago/set 2026 (PRD-121 → PRD-139); a poda de 21/08 já tirou o catálogo E2E (38% do Perfil) para `knowledge/`. O que sobrou é prosa viva de PRDs de 30 dias.
3. O que dá para enxugar sem perder nada é **consolidação de duplicatas** (🟡): ~10 pares reais (aclExigir fora do choke point ×2, teardown em worktree ×2, rate-limit da sugestão ×2, `_salas_helpers` ×2, colunas geradas ×2, `central_ativa`/`blindagem` ×2, payload GOWS tabela+item 12, armadilhas 63/65/67 vs a seção ACL) — ganho estimado **8–12 KB**, decisão humana.
4. **151 entradas sem carimbo** (59%) são o passivo real: a régua "carimbo > 12 meses" nunca vai alcançá-las, e o script só as classifica pelo que citam. Vale uma passada humana de carimbagem retroativa nas seções "Armadilhas do projeto" (itens 1–60) e E2E (lista pré-PRD-121) — sem isso a poda seguinte volta a ser chute.
5. As duas seções que pesam são **Armadilhas do projeto (78 KB, 119 entradas)** e **Armadilhas E2E (18 KB, 110)**; a próxima economia estrutural, além das duplicatas, é a mesma jogada de 21/08: mover o detalhe das armadilhas 1–60 (sem carimbo, todas vivas) para `knowledge/` deixando o gatilho de reconhecimento — mas isso é redesenho, não poda.

## Peso por seção

| Seção | Entradas | KB | 🟢 | 🟡 | 🔴 |
|---|---|---|---|---|---|
| Armadilhas do projeto (anti-patterns) | 119 | 78 | 0 | 12 | 107 |
| Armadilhas de teste/seed (E2E) | 110 | 18 | 0 | 12 | 98 |
| Autorização (ACL) | 17 | 11 | 0 | 6 | 11 |
| Integrações com efeitos colaterais irreversíveis | 7 | 9 | 0 | 1 | 6 |
| Testes E2E | 1 | 3 | 0 | 1 | 0 |
| Safe Mode (Pré-flight da `/prd-exec`) | 1 | 2 | 0 | 0 | 1 |
| Estrutura de diretórios do projeto | 1 | 1 | 0 | 0 | 1 |

Seções fixas do harness ignoradas (não podáveis): Identificação, CLI, allowlist, Banco, Aplicação, Lint, Codex review,
Agentes, Convenções, Economia, Nível de esforço, Manual vivo, Plataformas, Worktrees, Compatibilidade, Timezone.

## 🟢 Morto-provado — NENHUMA entrada

| Linha | Seção | Entrada | Evidência |
|---|---|---|---|
| — | — | — | — |

O que foi testado para chegar a zero (1 `find` no repo + 1 `grep -rwF` no código, fora de `.claude/`, `prds/`, `docs/`):
- **caminhos com `/` e extensão** (sufixo tolerante: `api/x.php` ≙ `administrativo/api/x.php`): todos existem;
- **arquivos soltos entre crases** (`waha_config.php`, `PRD-096-dt257-badge-oculto.spec.js`…): todos existem;
- **`tabela.coluna`** com a tabela em `CREATE TABLE` das 194 migrations / `schema_taurus_atualizado_2025.sql` /
  `database.md`: toda coluna citada aparece no schema ou no código;
- **funções `nome()` e chaves `snake_case`**: todas aparecem no código como palavra inteira (a única ausente é
  `preview_screenshot`, nome de tool MCP — não é código; ficou 🟡, nunca 🟢);
- **PRD de origem revertida**: nenhuma das PRDs carimbadas está com status Revertida no `prds/INDEX.md`
  (a prosa "revertido em seguida" da PRD-135 é texto de gate, não a coluna Status — o script lê a coluna).

Erros do script corrigidos DURANTE esta análise (por isso o zero é confiável): (1) funções `_privadas` (`_wahaCorParaBody`,
`_chavesSegredoPrefetch`, `_mapaSegredosPort`, `_gcalTituloComSala`) apareciam mortas por um filtro que descartava o
underscore inicial antes do grep — **todas existem**; (2) `C:/laragon/...` e `/Applications/MAMP/...` viravam caminho
relativo "morto" — caminho absoluto de máquina saiu da régua; (3) `tolower()` do gawk em `LC_ALL=C` corrompia acentos e
a seção "Execução autônoma" (fixa) entrava como podável; (4) identificador morto sozinho virou 🟡, nunca 🟢.

## 🟡 Suspeito — um a um, para decisão

Legenda da coluna **Leitura manual**: ✅ duplicata real (consolidar) · ➕ sobreposição parcial (fundir ou deixar ponteiro) ·
❌ falso positivo do script (manter) · ❓ decisão de conteúdo.

| # | Linha | Seção | Entrada (início) | Razão do script | Leitura manual |
|---|---|---|---|---|---|
| 1 | 482 | ACL | 🔴 `aclExigir()` fora do choke point NÃO herda nada do `aclGuardRota()` | duplicata provável de L516 (`aclGuardRota`, `aclSchemaDisponivel`, `aclAtiva`) | ✅ **Mesma lição, duas redações** (a de L516 é a "lição do LOTE-027", mais completa). Manter uma. ~1,5 KB |
| 2 | 516 | ACL | Guard imperativo fora do choke point NÃO herda nada do `aclGuardRota()` — lição do LOTE-027 | duplicata provável de L482 | ✅ par do #1 |
| 3 | 108 | Integrações | [WhatsApp via WAHA] linha "Webhook `message.any`" | duplicata provável de L635 (`payload.to`, `_data.Info.Chat`, `_data.Info.RecipientAlt`, `source`) | ➕ A tabela é a canônica; a armadilha 12 (L635) repete os campos e termina com "Ver linha Webhook message.any acima". Reduzir a 12 a um ponteiro de 1 linha. ~0,6 KB |
| 4 | 635 | Armadilhas | 12. Confiar nos campos de topo do payload do webhook GOWS | duplicata provável de L108 | ➕ par do #3 |
| 5 | 851 | E2E | 🔴 [PRD-135-b] Em worktree, o `_global-teardown` NÃO limpa nada (DT-554) | duplicata provável de L856 (`_global-teardown`, `cjzawcndgj_local`, worktree) | ✅ L856 (PRD-138) repete "o `_global-teardown` só reconhece `cjzawcndgj_local`, não limpa nada (DT-554)". Fundir: uma entrada DT-554 + a parte "sem `node_modules`" da 856. ~0,5 KB |
| 6 | 856 | E2E | [PRD-138] Worktree novo nasce sem `node_modules` e sem limpeza de E2E | duplicata provável de L851 | ✅ par do #5 |
| 7 | 853 | E2E | [PRD-138] Suíte que chama `sugerir_resposta.php` esgota `inbox_sugestao_limit_hora` | duplicata provável de L942 (`inbox_sugestao_limit_hora`, sugestão) | ➕ L942 (PRD-109) já dizia que o rate-limit é global e acumula entre specs; a 853 acrescenta o número (~8 chamadas/rodada) e o sintoma "parece erro funcional". Fundir na 942. ~0,4 KB |
| 8 | 942 | E2E | Rate-limit por hora (`inbox_sugestao_limit_hora` e afins) é GLOBAL e acumula entre specs (PRD-109) | duplicata provável de L853 | ➕ par do #7 |
| 9 | 785 | Armadilhas | 90. [PRD-133] Fonte única `api/dependencias/_salas_helpers.php` (13 funções) — nunca reimplementar | duplicata provável de L783/L797 (`salasSchemaDisponivel`, `salasColunaDisponivel`) | ➕ L797 (PRD-133-b, "ganha mais 3 funções") é continuação literal da 90. Fundir 96 dentro da 90 (a 89 é outra coisa: engine de conflito — ❌ para a 89). ~0,5 KB |
| 10 | 797 | Armadilhas | 96. [PRD-133-b] Fonte única `_salas_helpers.php` ganha mais 3 funções | duplicata provável de L783/L785 | ➕ par do #9 |
| 11 | 783 | Armadilhas | 89. [PRD-133] A engine única de conflito ganha o eixo SALA | duplicata provável de L785/L797 | ❌ compartilha os guards de schema com as vizinhas, mas a lição (shim `existeConflitoAgenda()`) é própria. Manter |
| 12 | 763 | Armadilhas | 76. [PRD-126] Trava de unicidade parcial via coluna gerada + `UNIQUE` — nunca `PERSISTENT`/`STORED` | duplicata provável de L809 (`persistent`, `virtual`) | ➕ L809 (PRD-136) é a 2ª lição sobre coluna gerada no MariaDB (`CONCAT()` em índice). Não é duplicata, mas cabem numa entrada "colunas geradas: 3 regras" junto com a 95 (L795). ~0,3 KB |
| 13 | 809 | Armadilhas | 102. [PRD-136] 🔴 Coluna gerada que entra em ÍNDICE não pode usar `CONCAT()` no MariaDB | duplicata provável de L763 | ➕ par do #12 |
| 14 | 795 | Armadilhas | 95. 🔴 [PRD-133-b] Coluna gerada + `INSERT` posicional em `horarios_bloqueados` = `ERROR 3105` | "regra já é convenção da casa: cron-smart.md (5 termos)" | ❌ falso positivo: os termos em comum são genéricos de migration; a lição não está na convenção. Manter (ou juntar ao #12 como 3ª regra de coluna gerada) |
| 15 | 950 | E2E | [PRD-121] `central_ativa` é estado GLOBAL — ligar no próprio `beforeAll` | duplicata provável de L953 (`central_ativa`, `beforeAll`) | ➕ L953 diz literalmente "mesmo padrão de `central_ativa`/PRD-121". Uma entrada "flags globais de feature (`central_ativa`, `blindagem_paciente_ativa`): `beforeAll`/`afterAll`". ~0,4 KB |
| 16 | 953 | E2E | [PRD-124] `blindagem_paciente_ativa` (mesmo padrão de `central_ativa`) | duplicata provável de L950 | ➕ par do #15 |
| 17 | 878 | E2E | Procedimento de fixture pode estar INATIVO (`procedimentos.status=0`, `valor=0`) | duplicata provável de L938 (procedimento, procedimentos) | ➕ L938 (PRD-106) é o caso "ATIVO com `valor=0` e `valor_customizado>0`". Fundir numa só: "procedimento de fixture: conferir `status` E `valor`". ~0,3 KB |
| 18 | 938 | E2E | Procedimento de fixture pode ter `procedimentos.valor = 0` mesmo ATIVO | duplicata provável de L878 | ➕ par do #17 |
| 19 | 665 | Armadilhas | 27. Header avatar em `montarUserInfoHeader()`, NUNCA na global `pageInit` (PRD-079) | duplicata provável de L671 (`pageInit`, `user.js`, `components.css`) | ➕ a 30 (L671) repete a mecânica do `pageInit`/`user.js` para explicar o `window.pageInit` em strict. Sobreposição de explicação, lições distintas. Cortar a explicação repetida da 30. ~0,3 KB |
| 20 | 671 | Armadilhas | 30. Override de Select2 no `components.css` exige `body`; `pageInit` em strict deve ser `window.pageInit` | duplicata provável de L665 | ➕ par do #19 |
| 21 | 737 | Armadilhas | 63. [PRD-123] O guard central roda no fim de `api/dependencias/utils.php`; diretório não mapeado = DENY | duplicata provável de L456 (`verbos_ler`, `verbos_escrever`, `utils.php`) | ✅ A seção **Autorização (ACL)** (LOTE-029, L396+) foi escrita para ser "a fonte que `/prd`/`/prd-exec` apontam; regra completa só aqui". As armadilhas **63, 65 e 67** (PRD-123, anteriores) repetem a seção. Reduzir as três a um ponteiro "ver Autorização (ACL)". ~2 KB |
| 22 | 741 | Armadilhas | 65. [PRD-123] `aclAtiva()` (`configuracoes.acl_ativa`) é a ÚNICA decisão que falha para `false` | duplicata provável de L528 (`configuracoes.acl_ativa`) | ✅ mesma coisa que "Ligar a matriz" (L528) na seção ACL. Ponteiro |
| 23 | 745 | Armadilhas | 67. [PRD-123] Recurso mapeado para `catalogos` aceita `administrativo.ler` como alternativa | duplicata provável de L442 (`catalogos.ler`, `agenda.ler`, `leads.ler`, `acl_helpers.php`, `administrativo.ler`) | ✅ L442 (lista dos 8 módulos, seção ACL) já traz a alternativa `administrativo.ler`. Ponteiro |
| 24 | 456 | ACL | Recurso = pasta do endpoint; verbo = nome do arquivo. O manifesto `aclManifesto()` | duplicata provável de L737 e de L880 (`alterar`, `listar`, `buscar`) | ❌ é a canônica (fica); a duplicata é a 63 (#21). O par com L880 é ruído (verbos genéricos) |
| 25 | 528 | ACL | Ligar a matriz: `configuracoes.acl_ativa` (`'0'` sombra / `'1'` aplica) | duplicata provável de L741 | ❌ canônica (fica); a duplicata é a 65 (#22) |
| 26 | 442 | ACL | Estes são os 8 módulos reais (cada um com `.ler`/`.escrever`) | duplicata provável de L406 e L745 | ❌ canônica (fica); L406 (PRD-131) é a nota histórica do desdobramento de `financeiro.*` — ❓ vale checar se a lista de L442 já absorveu `financeiro.cobranca`/`propria_remuneracao`; se sim, a L406 pode virar 2 linhas |
| 27 | 406 | ACL | [PRD-131] A chave `financeiro.ler` colapsava três propósitos | duplicata provável de L442 e L769 | ❓ ver #26. Nota de decisão longa (1,6 KB) cujo "o que vale hoje" já está na tabela dos módulos |
| 28 | 769 | Armadilhas | 82. [PRD-131] Pastas estritas da ACL: ação nova DEVE declarar capacidade em `acl_rotas.php['capacidades']` | duplicata provável de L406 e L506 | ➕ a parte "manifesto `capacidades`" já está em L406; a regra do golden file `tools/acl-matriz.tsv` só existe aqui. Manter a 82, cortar de L406 |
| 29 | 506 | ACL | 🔴 Não confundir `acl.js:471` com `:531` (`ehAdmin()` de `aplicarMenu()` vs `avaliarPagina()`) | duplicata provável de L88 (tabela Testes E2E) e L769 | ❌ falso positivo: a tabela E2E cita as mesmas funções na linha "Acceptance com perfil não-admin". Manter |
| 30 | 88 | Testes E2E | tabela Campo/Valor (Framework, Base URL, Verificação visual, Acceptance não-admin) | duplicata provável de L506 | ❌ falso positivo (ver #29). Manter |
| 31 | 859 | E2E | macOS/MAMP: `waitUntil:'load'` trava com CDN externo; dispatcher via `execSync` exige `E2E_PHP` 7.4 (PRD-098) | duplicata provável de L910 (`execSync`) | ❌ lições diferentes (macOS/CDN vs aspas no Windows). Manter |
| 32 | 910 | E2E | `php -r` via `execSync`/`cmd.exe` no Windows exige aspas DUPLAS (PRD-093) | duplicata provável de L859 | ❌ par do #31. Manter |
| 33 | 880 | E2E | Endpoints de `configuracoes/` (`buscar`/`listar`/`alterar`) agora usam Convenção C1 (PRD-073 DT-137) | duplicata provável de L456 | ❌ ruído de verbos genéricos. ❓ mas é uma nota de migração de 2026-06 ("agora usam") — candidata a virar 1 linha ou sair, se a Convenção C1 já é a regra da casa no Perfil (é: "Estrutura de diretórios › Autenticação") |
| 34 | 912 | E2E | `preview_screenshot` (MCP Claude_Preview) pode dar timeout de 30s neste ambiente (PRD-094) | só identificador morto: `preview_screenshot` não existe no código (é nome de tool MCP) | ❓ Não é código, então o script não pode provar. Mas desde a **3.0.3** a evidência visual canônica é Playwright headless e o Perfil (campo "Verificação visual") já diz que o Browser pane não funciona nesta máquina. Provável obsoleta — decisão do Charles |

(34 linhas porque L783 e L442/L456/L528 aparecem como "par" de outras; o script conta 32 entradas 🟡.)

**Se todas as ✅ e ➕ forem consolidadas:** ~8–12 KB a menos (139 → ~128 KB), sem perder nenhuma lição. Os ❌ (9) ficam.

## O que mais pesa (para a próxima rodada, além da poda)

| Bloco | KB | Observação |
|---|---|---|
| Armadilhas do projeto, itens 1–60 (sem carimbo, pré-PRD-121) | ~35 | Todas com referência viva. Candidatas à jogada de 21/08: detalhe para `knowledge/`, gatilho de 1 linha no Perfil — mas só depois de carimbá-las retroativamente (PRD de origem está no texto entre parênteses). |
| Armadilhas do projeto, PRD-121 → PRD-139 (carimbadas) | ~43 | Prosa de 30 dias; densa por natureza (cada uma tem *Por que* + *Como fazer*). Poda aqui é edição, não evidência. |
| Armadilhas E2E (110 itens) | 18 | Já é índice (catálogo em `knowledge/armadilhas-e2e-playwright.md`). 12 🟡 acima. |
| Autorização (ACL) | 11 | Canônica desde LOTE-029; o ganho está em apagar as cópias nas armadilhas 63/65/67 (#21–23). |
| Integrações | 9 | 7 tabelas; a do WAHA (3 KB) é a maior. Só o ponteiro da armadilha 12 (#3). |

## Como reproduzir

```bash
cd C:/laragon/www/vault/projetos/referencias/harness
bash .claude/hooks/perfil-poda.sh --root C:/laragon/www/dra-mariana-duarte --md   # ~25 s neste PC
# ou, de dentro do Mariana (depois do /deus levar o hook): bash .claude/hooks/perfil-poda.sh --md
```

---
`PODA-RESUMO|entradas=256|verde=0|amarelo=32|vermelho=224|kb=139`
