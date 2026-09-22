# Contrato mecânico — SCOUT / ANALISTA (peter-quill, atlas, tony-stark, themis, prometeu, ariadne)

> Estes papéis não recebem packet: o prompt aponta o alvo. Leia este contrato quando o prompt o
> citar — ou sempre que rodar sem ele. Só a mecânica; a pergunta que cada um responde e o formato
> do retorno estão em `.claude/agents/<papel>.md`.

## Onde ler

Comece pelo `.claude/PERFIL-RESUMO.md` (fallback: `.claude/PERFIL-PROJETO.md`); sem nenhum,
declare a limitação no relatório e trabalhe com o que o Grep mostrar. Abra o Perfil completo só na
seção que uma dúvida pontual pedir. Para ler arquivo, listar pasta ou procurar texto use Read, Glob
e Grep; o hook `guard-bash` nega leitura pura via Bash em subagente, porque cada Bash cria um
processo e passa pelos hooks. Bash é para executar (git read-only, um script do harness, Playwright)
— agrupe num comando só.

## Evidência

O que você reporta foi visto no código, com `arquivo:linha`; "provavelmente existe" não entra no
mapa — ou você localiza, ou marca como "não encontrado / a confirmar". O que não pôde verificar
(consumidor fora do repo, doc ausente) é listado como tal, nunca disfarçado de "impacto zero".

## Fôlego

Existe um teto de chamadas por despacho e você não o vê nem o conta. Quando o hook `guard-folego`
negar uma ferramenta, pare: devolva o que já mapeou com a cobertura declarada (o que foi varrido,
o que ficou de fora) e a marca `PARCIAL-TEMPO`. Profundidade é proporcional ao pedido — varra
amplo para achar e leia fundo só os poucos arquivos que decidem.

## Temporários

Precisou de arquivo auxiliar (screenshot, lista, diff)? Scratchpad da sessão ou
`.claude/.harness-run/tmp/` — nunca `/tmp` nem caminho de raiz (no Git Bash do Windows isso cai
fora do projeto e pendura a execução num prompt de permissão que ninguém vê). O hook `guard-bash`
bloqueia o padrão.

## Classificador de permissão indisponível

Comando negado com "temporarily unavailable" ou "cannot determine the safety" é o classificador do
auto mode fora do ar, não um juízo. Seu trabalho é majoritariamente read-only (Read/Grep/Glob não
passam pelo classificador): siga por aí; 1–2 tentativas no máximo e o que ficou sem rodar vira nota
no relatório.

## Evidência visual (ariadne, quando aplica)

O caminho canônico é o Playwright headless gravando arquivo: `npx playwright screenshot "<url>"
<pasta>/<nome>.png`. Sem Playwright, degrade para análise estática e declare no relatório que não
houve verificação visual — nunca finja que houve. Ver `PLATAFORMAS.md §7`.

## Retorno

Devolva o relatório no formato do seu `.md`. Você não altera o projeto (Write só quando o seu
`.md` o prevê — relatório ou maquete em pasta própria); não commita. Se a sessão-pai quiser o
relatório em arquivo e você não tem Write, ela o salva.
