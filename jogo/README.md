<p align="center"><img src="fontes/logo.png" alt="Terna" width="520"></p>

# Terna — o jogo

Jogo de plataforma 2D em pixel art. Roda no navegador hoje e está preparado para virar app
de PC. Tem servidor com banco para contas, saves na nuvem, ranking e multiplayer.

Tudo do jogo mora nesta pasta `jogo/`. Na raiz do repositório só ficam um README curto, o
`render.yaml` (deploy do servidor) e a configuração do editor e do preview do Claude Code.

## Rodar

Precisa do **Node 22.12 ou mais novo**.

```bash
cd jogo
npm install
npm run dev
```

Abra <http://localhost:5173>. O `npm run dev` sobe o servidor (porta 3001) e o cliente
(porta 5173) juntos; o cliente repassa `/api` para o servidor. Não precisa instalar banco:
em desenvolvimento o servidor usa o **PGlite**, um Postgres embutido que grava em
`apps/servidor/dados/banco/`. Para zerar o banco local, apague essa pasta.

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor + cliente, recarregando ao salvar |
| `npm run dev:cliente` | só o jogo (sem servidor, o jogo roda igual; só a parte online não) |
| `npm run typecheck` | confere os tipos de todos os pacotes |
| `npm test` | testes (o servidor testa contra um banco novo na memória) |
| `npm run build` | gera `apps/cliente/dist/` (site estático) e `apps/servidor/dist/` |
| `npm run db:gerar` | cria a migração do banco depois de mudar `schema.ts` |
| `npm run db:migrar` | aplica as migrações (o servidor também aplica sozinho ao subir) |
| `npm run arte:cenario` | regera o cenário a partir de `fontes/` |
| `npm run arte:personagem` | regera o personagem a partir de `fontes/SpriteBase.png` |

## Como está organizado

```
jogo/
├── apps/
│   ├── cliente/          o jogo (Vite + TypeScript + Canvas 2D)
│   │   └── src/
│   │       ├── main.ts       laço do jogo e ciclo das telas: menu → partida → fim → menu
│   │       ├── partida.ts    uma partida: tempo, a CPU ou o outro jogador (pela rede)
│   │       ├── inicio/       telas em HTML: carregamento, tela inicial (nome e modos),
│   │       │                 multiplayer (criar/entrar em sala), menu da engrenagem e fim
│   │       ├── motor/        peças genéricas: carregar imagem, criar/reduzir sprite, sorteio
│   │       ├── mundo/        céu, sol, nuvens, árvores, luz, chão e minhocas
│   │       ├── entidades/    personagem e animais
│   │       ├── rede/         API HTTP e conexão de tempo real com o servidor
│   │       ├── save/         save local (navegador) ou na conta (servidor), mesmo jeito de usar
│   │       ├── gerado/       recortes das folhas de sprite (saída das ferramentas; não editar)
│   │       └── assets/       folhas de sprite (saída das ferramentas; não editar)
│   └── servidor/         API + tempo real (Node + Fastify + Drizzle)
│       ├── src/
│       │   ├── rotas/        contas, sessões, saves, ranking
│       │   ├── tempo-real/   WebSocket: quem está no mundo e onde (com conta)
│       │   ├── partida/      salas 1v1 com código, sem conta: tempo marcado pelo servidor
│       │   ├── auth/         hash de senha (scrypt) e sessões (token)
│       │   └── banco/        schema, conexão (PGlite ou Postgres) e migrações
│       └── drizzle/          migrações SQL (versionadas)
├── packages/
│   └── compartilhado/    o que cliente e servidor precisam concordar
│       └── src/
│           ├── contas.ts, saves.ts, ranking.ts, protocolo.ts   formatos validados com zod
│           └── conteudo/     dados do jogo (comportamento dos animais…)
├── ferramentas/          geradores de sprite (leem fontes/, escrevem no cliente)
└── fontes/               artes originais em alta resolução
```

### Por que assim

- **Um contrato só.** Cada formato que atravessa a rede (cadastro, save, mensagem de tempo
  real) é um esquema zod em `compartilhado`. O cliente usa o mesmo esquema para montar e o
  servidor para validar, e o TypeScript acusa quando um lado muda e o outro não.
- **Banco é do jogador; conteúdo é do jogo.** Contas, sessões, saves e recordes vão para o
  Postgres. Números de comportamento, itens, mapas, falas ficam em `compartilhado/src/conteudo/`,
  versionados com o código: passam por revisão, e cliente e servidor leem os mesmos valores
  (o servidor vai precisar deles para validar o que os jogadores fazem no multiplayer).
- **PGlite em dev, Postgres em produção.** É o mesmo Postgres dos dois lados, então as
  migrações e as consultas são as mesmas; só muda o `DATABASE_URL`.
- **Cliente independente.** O jogo roda sem servidor. A parte online (`rede/`, `save/`) é
  opcional e o save local continua funcionando sem conta.

## Banco de dados

Tabelas em `apps/servidor/src/banco/schema.ts`:

| Tabela | O que guarda |
|---|---|
| `jogadores` | conta: nome (único, sem diferenciar maiúsculas), e-mail opcional, hash da senha |
| `sessoes` | cada login: hash do token e validade (30 dias por padrão) |
| `saves` | até 3 espaços de save por jogador; o conteúdo é JSON validado por `DadosSave` |
| `recordes` | melhor marca de cada jogador em cada categoria de ranking |

Para mudar o banco: edite `schema.ts`, rode `npm run db:gerar` (cria o SQL em `drizzle/`),
revise o SQL e versione. O servidor aplica a migração ao subir.

Para testar com um Postgres de verdade: `docker compose up -d` e, em `apps/servidor/.env`
(copie de `.env.exemplo`), `DATABASE_URL=postgres://terna:terna@localhost:5432/terna`.

## API

Tudo sob `/api`. Rotas com 🔒 pedem `Authorization: Bearer <token>`.

| Rota | O que faz |
|---|---|
| `GET /vivo` | servidor no ar (não toca no banco: é a checagem de saúde do host) |
| `GET /saude` | servidor e banco no ar (para diagnóstico manual) |
| `POST /contas` | cria conta `{ nome, senha, email? }` e já devolve a sessão |
| `POST /sessoes` | entra `{ login, senha }` (login = nome ou e-mail) |
| `DELETE /sessoes` 🔒 | sai (invalida o token) |
| `GET /eu` 🔒 | dados da conta |
| `GET /saves` 🔒 · `GET /saves/:slot` 🔒 · `PUT /saves/:slot` 🔒 | saves 1 a 3 |
| `GET /ranking/:categoria` · `POST /ranking` 🔒 | top 50 · enviar `{ categoria, valor }` |
| `WS /tempo-real?token=…` | mundo aberto com conta: `bem-vindo`, `entrou`, `saiu`, `posicao` (ver `protocolo.ts`) |
| `WS /partida?acao=criar&nome=…` | cria uma sala 1v1 e recebe `sala-criada` com o código (sem conta) |
| `WS /partida?acao=entrar&codigo=…&nome=…` | entra na sala: `comecou` para os dois, depois `estado` de um para o outro e `fim` (ver `partida.ts`) |

Criar conta e entrar aceitam 10 tentativas por minuto por endereço; criar ou entrar em sala, 30.

## Partida

Cada partida dura `DURACAO_PARTIDA_MS` (5 minutos, em `compartilhado/src/partida.ts`). O
jogador escolhe um nome na tela inicial (2 a 12 caracteres, guardado no navegador) e ele aparece
em cima da cabeça sem acento, porque a fonte de pixels não tem acentos.

- **Singleplayer:** você contra a CPU (o sósia). O cronômetro é do cliente e a engrenagem (ou
  Esc) pausa tudo.
- **Multiplayer 1v1:** um cria a sala e passa o código de 5 caracteres; o outro entra com ele.
  O servidor marca o tempo e avisa o fim aos dois ao mesmo tempo. Cada cliente simula o próprio
  personagem e manda ~10 vezes por segundo os botões segurados e a posição; o outro lado move o
  corpo com os mesmos botões e corrige a posição aos poucos. A engrenagem só abre o menu: a
  partida continua, e o seu personagem fica parado enquanto isso. Sair da partida encerra para
  os dois.

## Publicar

O passo a passo do deploy grátis (Cloudflare + Render + Neon) e a conta dos limites mensais
estão em [DEPLOY.md](DEPLOY.md).

## App de PC (depois)

O build do cliente (`apps/cliente/dist/`) é um site estático com caminhos relativos, então
dá para embrulhar num app de PC sem mudar o jogo. O caminho sugerido é o **Tauri** (app
pequeno, usa o navegador do sistema): criar `apps/desktop/` apontando para `apps/cliente/dist`
e definir `VITE_API_URL` com o endereço do servidor publicado. Electron também serve, com um
instalador bem maior.

## Cuidados ao mexer

- **Contrato novo só em `compartilhado`.** Formato de request/response, mensagem de tempo real
  ou save definido direto no cliente ou no servidor faz um lado aceitar o que o outro não entende.
- **Save mudou de formato → versão nova.** Crie `DadosSaveV2` e a conversão em `atualizarSave`;
  alterar a V1 impede os saves já gravados (navegador e banco) de abrir.
- **`src/gerado/` e as folhas de sprite em `src/assets/` saem das ferramentas.** Mude o gerador
  ou a arte em `fontes/`: editar à mão some na próxima geração.
- **Arquivo `.ts` novo que ninguém importa entra no `files` do `tsconfig.json` do pacote.** Numa
  pasta sincronizada pelo OneDrive, o TypeScript 7 (o compilador em Go) não enxerga os arquivos
  pelo `include` — o OneDrive os marca como reparse point — e só checa o que está em `files` ou é
  importado a partir dele. Fora da lista, um teste ou script novo passaria no `typecheck` sem ser
  olhado. Com o repositório fora do OneDrive, as listas `files` podem sair.
- **Testes do servidor partem de um banco-modelo.** Criar um PGlite do zero leva de 6 a 12 s
  (roda o `initdb` do Postgres em WASM). O setup global (`apps/servidor/test/banco-modelo.ts`)
  migra um banco uma vez e cada arquivo de teste abre uma cópia dele (~1 s) via `novoServidor()`.
  Nos testes, use nomes de conta únicos: o banco vive o arquivo inteiro.
- **Tempo real nos testes:** o servidor manda `bem-vindo` assim que conecta; ouça em `onInit`
  (`app.injectWS(url, {}, { onInit })`), não depois do `await`.

## Pontos em aberto

- A partida ainda não tem objetivo nem vencedor: o tempo acaba e pronto. Quando entrar dano,
  o servidor da sala é o lugar de decidir quem venceu.
- Contas, saves e o mundo aberto (`rede/api.ts`, `rede/tempo-real.ts`, `save/save.ts`) estão
  prontos e testados, mas o jogo ainda não os usa: faltam tela de entrar/criar conta e quando
  salvar.
- Ranking e posição vêm do cliente e só são validados por faixa. Antes de o ranking valer
  algo, o servidor tem de calcular a pontuação.
- Recuperar senha por e-mail ainda não existe (o e-mail já é guardado).
