# Deploy grátis do Terna

```
jogador ──► Cloudflare Workers  (o jogo: arquivos estáticos)
              │
              └─ /api e WebSocket ──► Render  (servidor Node)  ──► Neon  (Postgres)
```

| Parte | Onde | Endereço |
|---|---|---|
| Jogo (`apps/cliente`) | Cloudflare Workers, plano Free | `https://terna.<seu-subdominio>.workers.dev` |
| Servidor (`apps/servidor`) | Render, plano Free | `https://terna-servidor.onrender.com` |
| Banco | Neon, plano Free | string de conexão `postgresql://…neon.tech/neondb?sslmode=require` |

Os três aceitam login com a conta do GitHub. O Render não pede cartão no plano grátis.
Os três fazem deploy sozinhos a cada `git push` na `main`.

---

## Passo a passo (uma vez só, ~20 minutos)

Antes de tudo: faça commit e push deste projeto para o GitHub (`joaodouglasdantas/Terna`).

### 1. Banco — Neon

1. Entre em <https://neon.com> (Sign up → GitHub).
2. Crie um projeto:
   - **Name:** `terna`
   - **Region:** **AWS US East 1 (N. Virginia)** (a mesma região do servidor no Render)
3. Na configuração do compute da branch principal (**Edit compute**), deixe o tamanho
   **fixo em 0.25 CU** (mínimo 0.25 e máximo 0.25). **Isto é importante**: com autoscaling até 2 CU, o banco
   pode gastar as horas do mês 8 vezes mais rápido.
4. Em **Connect**, desligue **Connection pooling** e copie a string de conexão. Ela começa
   com `postgresql://` e termina com `?sslmode=require` (se vier `&channel_binding=require`
   junto, pode deixar).

### 2. Servidor — Render

1. Entre em <https://render.com> (Sign up → GitHub) e autorize o repositório `Terna`.
2. **New → Blueprint**, escolha o repositório `Terna`. O Render lê o `render.yaml` da raiz e
   mostra o serviço `terna-servidor`.
3. Ele pede duas variáveis:
   - **DATABASE_URL:** cole a string do Neon.
   - **ORIGENS_PERMITIDAS:** por enquanto `https://terna.workers.dev` (você corrige no passo 4).
4. **Apply**. O primeiro deploy leva uns 3 minutos. Ao subir, o servidor cria as tabelas
   no Neon sozinho.
5. Confira no navegador:
   - `https://terna-servidor.onrender.com/api/vivo` → `{"ok":true}`
   - `https://terna-servidor.onrender.com/api/saude` → `{"ok":true}` (este testa o banco)

   Se o Render deu outro endereço ao serviço (ex.: `terna-servidor-ab12.onrender.com`),
   troque o endereço em `jogo/apps/cliente/.env.production`, faça commit e push.

### 3. Jogo — Cloudflare

1. Entre em <https://dash.cloudflare.com> (Sign up) e confirme o e-mail.
2. **Workers & Pages → Create → Import a repository**, conecte o GitHub e escolha `Terna`.
3. Preencha:
   - **Project name:** `terna` (igual ao `name` de `apps/cliente/wrangler.jsonc`)
   - **Build command:** `npm ci && npm run build -w @terna/cliente`
   - **Deploy command:** `npx wrangler deploy -c apps/cliente/wrangler.jsonc`
   - **Path / Root directory** (em *Advanced settings*): `jogo`
4. **Deploy**. No fim aparece o endereço `https://terna.<seu-subdominio>.workers.dev`.
5. Em **Settings → Build → Build watch paths**, deixe só
   `jogo/apps/cliente/*`, `jogo/packages/*` e `jogo/package*.json`. Assim, commit que não
   mexe no jogo não gasta build.

### 4. Ligar um no outro

No Render, em **terna-servidor → Environment**, troque **ORIGENS_PERMITIDAS** pelo endereço
exato do jogo (`https://terna.<seu-subdominio>.workers.dev`, sem barra no fim) e salve. O
Render reinicia o serviço. Sem isso o navegador bloqueia o jogo de falar com o servidor.

Pronto: abra o endereço do jogo.

---

## Por que isso não cai depois de um mês

Todos os planos grátis abaixo **renovam todo mês e não expiram**. O que existe são cotas
mensais: se uma estoura, o serviço para até o mês seguinte. O projeto foi montado para ficar
longe de cada uma:

| Cota mensal | Limite grátis | Uso esperado | O que garante |
|---|---|---|---|
| Render: horas de servidor | 750 h | no máximo 744 h (31 dias × 24 h) | há **um** serviço grátis só. Não crie outro serviço grátis na mesma conta do Render: as 750 h são divididas entre todos. |
| Render: saída de dados | 5 GB | API: respostas de ~1 KB | o jogo em si (imagens, código) sai pelo Cloudflare, não pelo Render. Ver "multiplayer" abaixo. |
| Render: minutos de build | 500 min | ~2 min por deploy | `buildFilter` no `render.yaml`: só faz build quando muda o servidor ou o pacote compartilhado. |
| Neon: horas de processamento | 100 CU-h | 0,25 CU = até 400 h acordado | o banco dorme 5 min depois da última consulta. A checagem de saúde (`/api/vivo`) não consulta o banco e o servidor fecha as conexões 10 s depois de usá-las, então ele só fica acordado enquanto alguém entra, salva ou vê o ranking. |
| Neon: armazenamento | 0,5 GB | ~1 KB por jogador | 3 saves por jogador no máximo, 1 recorde por categoria, e as sessões vencidas são apagadas a cada login e a cada vez que o servidor sobe. |
| Cloudflare: acessos ao jogo | ilimitado | — | só arquivos estáticos (grátis e sem limite no Workers). |
| Cloudflare: minutos de build | 3.000 min | ~1 min por deploy | build watch paths do passo 3. |

E o que **não** foi usado de propósito: o Postgres grátis do **Render** (esse sim apaga o
banco 30 dias depois de criado) e o disco do servidor (é apagado a cada reinício, por isso o
PGlite só é usado no seu computador).

### O que ainda pode derrubar (e como perceber)

- **Primeiro acesso lento:** o servidor grátis dorme após 15 min sem ninguém. O próximo acesso
  leva ~1 min. O jogo já pede para ele acordar assim que abre, então quando o jogador chegar
  na parte online ele costuma estar de pé. Isso é espera, não queda. Um jogador conectado no
  multiplayer mantém o servidor acordado.
- **Multiplayer consumindo os 5 GB:** cada posição enviada é repassada a todos os outros. Com o
  cliente mandando no máximo 10 posições por segundo, e só quando o personagem se mexe, 4
  pessoas jogando juntas gastam ~40 a 70 MB por hora: dá ~70 a 120 h de partida a 4 por mês. Se o jogo
  crescer, é o primeiro limite a olhar.
- **Neon com muita gente:** 400 h acordado por mês são ~13 h por dia com alguém salvando ou
  entrando. Salve em momentos do jogo (ao sair, ao passar de fase), não a cada poucos segundos.
- **Regras dos provedores mudam.** Os limites acima foram conferidos em setembro de 2026.

Uma vez por mês, dê uma olhada em:
- Render → **Billing** (horas, banda e minutos de build usados)
- Neon → **Usage** (CU-h e armazenamento). Houve casos de projeto grátis que continuou pausado
  depois da virada do mês: se acontecer, a religação é em **Computes → Start** ou pelo suporte.

---

## Depois do deploy

- **Atualizar:** `git push` na `main`. O Cloudflare refaz o jogo e o Render refaz o
  servidor, cada um só se a sua parte mudou.
- **Mudar o banco:** edite `schema.ts`, rode `npm run db:gerar`, faça commit. O servidor aplica
  a migração no Neon ao subir.
- **Domínio próprio** (ex.: `terna.com.br`): dá para apontar para o Cloudflare de graça (só paga
  o domínio). Aí troque `ORIGENS_PERMITIDAS` no Render.
- **Sair do grátis:** quando precisar, um plano pago do Render tira o sono do servidor e amplia
  a banda; confira o preço atual em <https://render.com/pricing>. Neon e Cloudflare aguentam
  bastante coisa ainda no grátis.
