---
titulo: Harness Report — todos os projetos — 2026-08
janela: 2026-07-05 → 2026-08-04 (30 dias)
janela_anterior: 2026-06-05 → 2026-07-05 (30 dias)
gerado_em: 2026-08-04
escopo: --all --html
---

# Harness Report — todos os projetos — jul→ago/2026

**Janela:** 05/07/2026 → 04/08/2026 (30 dias) · **Comparada com:** 05/06 → 05/07 (30 dias)
**Escopo:** 16 arquivos de telemetria · **7 projetos com execuções reais** na janela

> **Pergunta desta rodada:** em julho o harness degradou (PRDs a 2-3h) e só se percebeu quando
> doeu; as versões 2.4.0/2.5.0 (30/07) foram a cura. **A cura segurou?**
> **Resposta curta: sim no custo — 32% menos tokens por execução, com 60% mais execuções.**
> Mas a duração deixou de ser mensurável (o campo que media isso quebrou) e sobrou um gargalo
> que a cura não tocou: o loop de gate da fase 2 no core do Taurus.

---

## ⚠️ Nota metodológica — 64% dos registros eram duplicatas

Antes de qualquer número: **os 5 clones do Taurus e o `doce-ana` carregam telemetria que não é
deles.** Os arquivos `harness-runs.jsonl` de `dr-renato-fernandes`, `dr-tarcisio-lucena`,
`dr-tarcisio-lucena-pdf`, `dr-thiago-couto` e `dra-cleice-bezerra` são **byte-idênticos** entre si
(mesmo md5) — é o histórico do core `dra-mariana-duarte` que viajou no `git merge upstream/main`
da `/propagar`. O `doce-ana` é subconjunto **exato** do core (124 de 124 registros comuns, **zero**
execuções próprias).

| | registros |
|---|---|
| Linhas brutas nos 16 arquivos | 1.256 |
| Execuções físicas únicas (após dedup) | **457** |
| Duplicatas de linhagem removidas | **799 (63,6%)** |

Sem essa deduplicação, cada PRD do core seria contada **7 vezes** e todas as medianas deste
relatório estariam envenenadas. A dedup usa a chave `(label, ts_start, ts_end, tokens_output,
elapsed_s)` e atribui a execução ao projeto de histórico mais longo (o core).

---

## Resumo — janela atual (281 execuções únicas)

| Grupo | n | Duração med | p90 | Ciclos med | Tokens out med | Espera registrada |
|---|---|---|---|---|---|---|
| criação-f1 | 75 | 23m38s ⚠️ | 50m45s | n/d | 173k | 56 min |
| criação-f2 | 82 | 48m18s ⚠️ | 3h02m | 3,0 | 424k | 72 min |
| execução | 85 | 1h51m ⚠️ | 7h46m | 2,0 | 331k | 10 min |
| lote (`/dt-exec`) | 37 | 37m18s ⚠️ | 1h22m | 1,0 | 135k | 0 |
| **mockup** | **0** | — | — | — | — | — |
| outros (retrabalho `-v2`) | 2 | 4h03m ⚠️ | 6h02m | 1,0 | 362k | 0 |

⚠️ **Toda duração desta tabela pode conter espera humana** — ver alerta #1. Use os tokens
(coluna limpa) para comparar custo.

**Mockups:** nenhuma execução `MOCKUP-*` na janela (nem na anterior). A separação pedida está
feita, mas não há curva de mockup para distorcer nada nesta rodada.

**Totais da janela:** 96,3M tokens de output · 138 min de espera humana registrada · 67 negações
do classificador · 7 bloqueios anti-espiral · 48 prompts de permissão.

### Por projeto

| Projeto | n | Tokens out | Duração med ⚠️ | Ciclos med | Denials |
|---|---|---|---|---|---|
| dra-mariana-duarte | 64 | 28,6M | 1h13m | 3,0 | 4 |
| aec-erp-frontend | 71 | 19,9M | 45m | 2,0 | 0 |
| aec-backend | 52 | 15,1M | 47m | 1,0 | 0 |
| sagittarius | 22 | 12,5M | 57m | 2,0 | **45** |
| newportaltefnet | 53 | 12,3M | 33m | 1,0 | **16** |
| caronte | 13 | 6,1M | 1h27m | 3,0 | 2 |
| starfilms-originalidade | 6 | 1,9M | 35m | 2,0 | 0 |

Sem execuções na janela: `3s-regulacao`, `suprema`, `equipe-tefnet-harness-base` (telemetria
vazia) e os 6 herdeiros da linhagem Taurus.

---

## Tendência vs janela anterior — a cura segurou?

| Grupo | Duração med (ant → atual) | Δ | Tokens out med (ant → atual) | Δ |
|---|---|---|---|---|
| criação-f1 | 22m24s → 23m38s | +6% ✅ | 179k → 173k | −3% ✅ |
| criação-f2 | 34m56s → 48m18s | +38% 🟡 | 420k → 424k | +1% ✅ |
| execução | 1h40m → 1h51m | +10% ✅ | 660k → **331k** | **−50%** ✅ |
| lote | n/d (n=0) | novo | — → 135k | novo |
| outros | 1h09m → 4h03m | +249% 🟠 | 854k → 362k | −58% |

Nenhum grupo estourou a régua de tendência (🟠 = mediana atual > 1,5× a anterior), **exceto
"outros" — que tem n=2** (as duas retomadas `PRD-108-fase2-v2` do Taurus). Com n=2 isso é ruído,
não tendência; registrado por transparência, não como alarme.

### A métrica-síntese

| | anterior | atual | Δ |
|---|---|---|---|
| Execuções | 176 | 281 | **+60%** |
| Tokens de output totais | 88,2M | 96,3M | +9% |
| **Tokens por execução** | **501k** | **343k** | **−32%** |

**O harness fez 60% mais trabalho por 9% mais tokens.** Esse é o ganho real e é medido na
métrica limpa (tokens não sofrem contaminação de espera humana). A cura segurou.

### Curva semanal (métrica limpa: tokens de output por execução)

| Semana | período | n | exec med | f2 med | denials |
|---|---|---|---|---|---|
| W25 | 15–21/06 | 64 | 848k | 474k | 0 |
| W26 | 22–28/06 | 57 | 626k | 340k | 0 |
| W27 | 29/06–05/07 | 51 | 626k | 479k | 0 |
| W28 | 06–12/07 | 73 | 295k | 375k | 2 |
| W29 | 13–19/07 | 60 | 310k | 387k | **57** |
| W30 | 20–24/07 | 70 | **265k** | 461k | 8 |
| W31 | 27/07–02/08 | 63 | 366k 🟡 | 543k | 0 |
| W32 | 03–04/08 | 15 | 694k 🟡 | 104k | 0 |

A queda é inequívoca: **848k → 265k entre W25 e W30 (−69%)**. O repique de W31 (366k, n=15
execuções) e W32 (694k, **n=3** execuções) merece vigilância, mas W32 tem três execuções apenas —
duas delas PRDs grandes de fechamento (`caronte PRD-005-exec` 700k, `dra-mariana PRD-110-exec`
688k). Não é tendência estabelecida; é o próximo ponto a conferir na rodada de 15/08.

> **Sobre o corte pré/pós 30/07:** tentei isolar o efeito das 2.4.0/2.5.0 comparando os runs
> anteriores e posteriores à data. **O corte não sustenta conclusão:** há só 7–9 execuções por
> grupo do lado pós-cura, e as poucas execuções pós-30/07 são dominadas por 2 runs com gap de
> 1-2h. A evidência boa da cura é a comparação de janelas completas e a curva semanal acima.

---

## Regressões e alertas

167 disparos de régua (99 🔴 / 68 🟠). **Mas 90 deles — todos os de duração e out_tps — são
artefato de medição, não de performance.** Ver alerta #1. Os alertas abaixo estão ordenados por
confiabilidade, não por contagem.

### 🔴 #1 — `elapsed_active_s` não desconta espera humana (82% dos runs)

O campo que existe exatamente para separar "harness trabalhando" de "sessão aberta esperando o
Charles" está inoperante:

| Sintoma | Medida |
|---|---|
| Runs com `elapsed_active_s` preenchido | 93 |
| Destes, `elapsed_active_s` **idêntico** ao `elapsed_s` bruto | **76 (82%)** |
| Runs com `wait_human_min = 0` | 78 (84%) |
| Runs com gap > 30 min **e** `wait_human_min = 0` | 28 |

Exemplos de duração "ativa" que claramente não é ativa:

| Projeto / label | duração "ativa" | max_gap | wait registrado | out_tps |
|---|---|---|---|---|
| sagittarius PRD-105-exec | 18h57m | **864 min (14,4h)** | 0 | 17,4 |
| dra-mariana-duarte PRD-104-fase1 | 13h54m | **811 min** | 0 | 4,2 |
| sagittarius PRD-108-exec | 15h25m | **603 min** | 0 | 10,8 |
| dra-mariana-duarte PRD-105-exec | 24h21m | 582 min | 0 | 14,8 |
| aec-backend PRD-023-exec | 11h30m | 595 min | 0 | 7,1 |

Uma sessão com gap de 14 horas é uma janela deixada aberta de um dia para o outro — não é o
harness levando 19h. **Consequência prática:** os 57 alertas 🔴 de duração e os 33 🟠 de `out_tps`
desta rodada medem o sono do Charles, não o harness. E, pior, enquanto o campo estiver assim
**o `/harness-report` não consegue detectar degradação real de performance** — que é a razão de
ele existir.

Filtrando só os runs com `max_gap_min ≤ 30` (medição confiável), o retrato muda:

| Grupo | n confiável | duração med |
|---|---|---|
| criação-f1 | 54 | 22m |
| criação-f2 | 52 | 47m |
| execução | 38 | **1h08m** (vs 1h51m no dado sujo) |
| lote | 34 | 32m |

Não dá para comparar isso com a janela anterior: `max_gap_min` só passou a ser gravado
recentemente (**0 runs** da janela anterior têm o campo).

### 🔴 #2 — Fase 2 do core do Taurus não converge (6 PRDs seguidas)

Ciclos é métrica **limpa** (não sofre espera humana), e aqui há um padrão sistemático no
`dra-mariana-duarte`:

| PRD | ciclos | preset | régua da época | tokens out |
|---|---|---|---|---|
| PRD-104-fase2 | **10** | maximo | 4 | n/d (3 registros; o de 3 ciclos gastou 892k) |
| PRD-105-fase2 | **9** | maximo | 4 | 751k |
| PRD-106-fase2 | **11** | maximo | 4 | 616k |
| PRD-107-fase2 | **9** | maximo | 4 | 598k |
| PRD-108-fase2 | 2 ✅ | maximo | 4 | 652k |
| PRD-109-fase2 | **9** | default | 4 | **1.586k** (3,7× a mediana do grupo) |
| PRD-110-fase2 | **8** | equilibrado | **3** (pós-2.5.0) | 501k |

**Seis das sete últimas fase2 rodaram de 8 a 11 ciclos** de gate contra uma base de 2-3 — a
exceção é a PRD-108, que fechou em 2. Para contraste, as fase2 anteriores (PRD-093 a PRD-103)
registraram 3 ciclos ou não gravaram o campo: **a escalada começa na PRD-104**. A 2.5.0 baixou a
base de ciclos, mas **o loop continua não fechando** — a `PRD-110-fase2`, já sob a régua nova,
gastou 8. Isso não é preset mal configurado: é o beholder/michelangelo não conseguindo zerar os
🔴 na spec desse projeto.

Total de violações de ciclo na janela, com a régua vigente em cada data (até 29/07 default 4;
a partir de 30/07 base+1 do preset): **12 pré-cura + 8 pós-cura**.

Outras fora do core: `caronte PRD-005-fase2` (6 ciclos, maximo), `aec-erp-frontend PRD-006-exec`
(7 ciclos, equilibrado), `sagittarius PRD-109-fase2` (5).

### 🔴 #3 — 67 negações do classificador (contra 0 na janela anterior) — **já cessadas**

| Projeto | negações | runs afetados | anti-espiral |
|---|---|---|---|
| sagittarius | **45** | 6 | 0 |
| newportaltefnet | **16** | 2 | 6 |
| dra-mariana-duarte | 4 | 2 | 1 |
| caronte | 2 | 1 | 0 |

Distribuição temporal — e a boa notícia:

| Semana | denials |
|---|---|
| W28 | 2 |
| W29 | **57** ← o pico |
| W30 | 8 |
| W31 | **0** |
| W32 | **0** |

**As negações cessaram — e cessaram com os projetos rodando**, não por inatividade: em W31 o
`sagittarius` fez 3 execuções e o `newportaltefnet` fez 8, ambos com zero negações. A allowlist
estreita corrigiu o problema. Fica o registro histórico do custo do episódio (67 interrupções em
11 execuções) e a confirmação de que a correção funcionou.

### 🟠 #4 — Execuções acima de 2× a mediana de tokens do grupo (32 casos)

Métrica limpa. As piores:

| Projeto / label | tokens out | × mediana do grupo |
|---|---|---|
| sagittarius PRD-106-exec | 1.780k | 5,4× |
| dra-mariana-duarte PRD-109-fase2 | 1.586k | 3,7× |
| dra-mariana-duarte PRD-094-exec | 1.559k | 4,7× |
| dra-mariana-duarte PRD-095-exec | 1.539k | 4,7× |
| dra-mariana-duarte PRD-105-exec | 1.300k | 3,9× |
| dra-mariana-duarte LOTE-005 | 996k | **7,4×** (grupo lote) |

---

## Top execuções mais caras

### Por tokens de output (critério limpo)

| Projeto | Label | Tokens out | Duração ⚠️ | Ciclos | Por que custou |
|---|---|---|---|---|---|
| sagittarius | PRD-106-exec | 1.780k | 7h43m | 2 | maior volume da janela; 15 denials no mesmo run |
| dra-mariana-duarte | PRD-109-fase2 | 1.586k | 1h52m | **9** | loop de gate não converge (alerta #2) |
| dra-mariana-duarte | PRD-094-exec | 1.559k | 4h48m | 2 | execução grande |
| dra-mariana-duarte | PRD-095-exec | 1.539k | 6h51m | 5 | ciclos acima da base + volume |
| dra-mariana-duarte | PRD-105-exec | 1.300k | 24h21m | 5 | 20 tasks / 6 ondas; gap de 582 min |

### Por duração (⚠️ contaminada — coluna `gap` mostra o quanto)

| Projeto | Label | Duração | max_gap | out_tps | Leitura |
|---|---|---|---|---|---|
| dra-mariana-duarte | PRD-105-exec | 24h21m | 582 min | 14,8 | sessão atravessou a noite |
| sagittarius | PRD-105-exec | 18h57m | **864 min** | 17,4 | 14h de gap — não é execução |
| sagittarius | PRD-108-exec | 15h25m | 603 min | 10,8 | idem |
| dra-mariana-duarte | PRD-104-fase1 | 13h54m | 811 min | 4,2 | fase 1 nunca leva 14h |
| aec-backend | PRD-023-exec | 11h30m | 595 min | 7,1 | 5 tasks apenas — o tempo é espera |

Nenhuma dessas cinco sustenta conclusão de performance. É exatamente o que a regra do
PLAYBOOK-TELEMETRIA proíbe — e o motivo do alerta #1.

---

## 📋 Fila do manual vivo — 14 PRDs aguardando absorção

| Projeto | pendentes | mais antiga |
|---|---|---|
| **aec-erp-frontend** | **7** | LOTE-021 … LOTE-027 (03/08, todas de Contas a Pagar) |
| **aec-backend** | **4** | PRD-025 (31/07) |
| caronte | 1 | PRD-005 (03/08) |
| dra-mariana-duarte | 1 | PRD-110 (03/08) |
| newportaltefnet | 1 | PRD-080 (31/07) |
| **Total** | **14** | |

Os 7 do `aec-erp-frontend` são todos LOTEs do mesmo módulo (Contas a Pagar) e do mesmo dia —
absorvem bem numa `/manual` só. O `aec-backend` tem 4 de módulos distintos (Contas a Pagar,
Autenticação, Solicitação de Pagamento). Nenhum projeto está em situação crítica de fila.

---

## 💡 Sugestões de melhoria

### 1. Consertar a medição de espera humana no `harness-metrics.sh` — **prioridade máxima**

**De onde vem:** alerta 🔴 #1 — 82% dos runs têm `elapsed_active_s` idêntico ao bruto e 84% têm
`wait_human_min = 0`, com gaps de até 14h.

**Por que importa mais que os outros:** este relatório existe para pegar degradação progressiva
cedo. Hoje ele **não consegue** — 90 dos 167 alertas são ruído de medição, e uma degradação real
de 30% ficaria escondida no meio deles. É o instrumento que está quebrado, não o motor.

**Ação concreta:** no `harness-metrics.sh`, derivar `wait_human_min` a partir dos gaps já
detectados (o `max_gap_min` é gravado corretamente) e subtraí-lo do `elapsed_active_s` — gaps
acima de um limiar (5-10 min) contam como espera, não como execução. Enquanto isso não entra,
o `/harness-report` deveria **descartar da mediana de duração** todo run com
`max_gap_min > 30` (na janela: 38 de 85 execuções sobrevivem ao filtro, amostra suficiente).

### 2. Investigar por que o loop de gate da fase 2 não fecha no `dra-mariana-duarte`

**De onde vem:** alerta 🔴 #2 — seis das sete últimas fase2 (PRD-104 a PRD-110) com 8-11 ciclos
contra base 2-3, incluindo uma (PRD-110) já sob a régua nova da 2.5.0. O comportamento começa na
PRD-104: as fase2 anteriores fechavam em 3.

**Por que importa:** é a regressão mais limpa e mais consistente do relatório (ciclos não sofrem
contaminação). Custo direto visível: a `PRD-109-fase2` gastou 1.586k tokens de output, 3,7× a
mediana do grupo. O core do Taurus é o projeto mais caro da janela (28,6M tokens, 30% do total).

**Ação concreta:** abrir uma fase2 do Taurus e ler os `REVIEW-beholder.md` de ciclos 1→N: se os
mesmos 🔴 reaparecem a cada ciclo, é spec pattern (a PRD não dá base para o gate fechar); se são
🔴 novos a cada volta, é o gate inflando achado. Suspeita adicional a checar no Perfil do projeto:
limite de ciclos explícito herdado (a 2.5.0 avisa que número explícito vira limite duro **sem**
escalada — e três dessas rodaram em preset `maximo`).

### 3. Parar de versionar `prds/_metrics/` nos clones do Taurus

**De onde vem:** a nota metodológica — 799 de 1.256 registros (63,6%) são o histórico do core
replicado em 6 pastas pela `/propagar`.

**Por que importa:** qualquer `/harness-report --all` rodado sem deduplicação produz um relatório
falso — o core é contado 7 vezes e as medianas globais viram as medianas do Taurus. Esta rodada
só escapou porque a duplicação foi detectada antes de agregar. A próxima pode não ser.

**Ação concreta:** adicionar `prds/_metrics/` ao `.gitignore` do core (propaga para os clones no
próximo merge) **ou** ensinar o `/harness-report` a deduplicar por `(label, ts_start, ts_end)` —
idealmente os dois. Vale checar também por que o `doce-ana`, que não é clone Taurus, carrega 124
registros do core sem nenhum próprio.

---

## Como reproduzir

```
/harness-report --all --html
```

Rodado do vault em 04/08/2026. Fonte: `C:\laragon\www\*\prds\_metrics\harness-runs.jsonl`
(16 arquivos). Read-only sobre os projetos — este relatório não alterou nada fora desta pasta.

**Convenções:** medianas (nunca médias); `elapsed_active_s` preferido a `elapsed_s`; campos
vazios em linhas antigas reportados como **n/d**, nunca como zero. Cobertura de campos na janela:
`tokens_output` 100% · `elapsed` 97% · `out_tps` 80% · `max_gap_min` 80% · `tasks` 73% ·
`ciclos` 63% · `wait_human_min` 35% · `waves` 24%.

**Próxima rodada:** 15/08/2026 (quinzenal). Conferir: (a) se o repique de tokens de W31/W32 se
confirmou ou foi ruído de amostra pequena; (b) se a fase 2 do Taurus voltou à base de ciclos;
(c) se `elapsed_active_s` passou a descontar gap.
