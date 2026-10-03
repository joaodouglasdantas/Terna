# Deploy grátis do Terna

```
jogador ──► Cloudflare Pages  (o jogo: arquivos estáticos, em terna.pages.dev)
              │
              └─ /api e WebSocket ──► Render  (servidor Node)  ──► Neon  (Postgres)
```

| Parte | Onde | Endereço |
|---|---|---|
| Jogo (`apps/cliente`) | Cloudflare Pages, plano Free | `https://terna.pages.dev` |
| Servidor (`apps/servidor`) | Render, plano Free | `https://terna-servidor.onrender.com` |
| Banco | Neon, plano Free | string de conexão `postgresql://…neon.tech/neondb?sslmode=verify-full` |

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
   Troque o `sslmode=require` por `sslmode=verify-full`: é a mesma segurança de hoje, e
   sem isso o servidor mostra um *SECURITY WARNING* no log (numa versão futura da biblioteca do
   Postgres, o `require` fica menos rígido).

### 2. Servidor — Render

1. Entre em <https://render.com> (Sign up → GitHub) e autorize o repositório `Terna`.
2. **New → Blueprint**, escolha o repositório `Terna`. O Render lê o `render.yaml` da raiz e
   mostra o serviço `terna-servidor`.
3. Ele pede duas variáveis:
   - **DATABASE_URL:** cole a string do Neon.
   - **ORIGENS_PERMITIDAS:** `https://terna.pages.dev` (o endereço do jogo, do passo 3).
4. **Apply**. O primeiro deploy leva uns 3 minutos. Ao subir, o servidor cria as tabelas
   no Neon sozinho.
5. Confira no navegador:
   - `https://terna-servidor.onrender.com/api/vivo` → `{"ok":true}`
   - `https://terna-servidor.onrender.com/api/saude` → `{"ok":true}` (este testa o banco)

   Se o Render deu outro endereço ao serviço (ex.: `terna-servidor-ab12.onrender.com`),
   troque o endereço em `jogo/apps/cliente/.env.production`, faça commit e push.

### 3. Jogo — Cloudflare Pages

1. Entre em <https://dash.cloudflare.com> (Sign up) e confirme o e-mail.
2. **Workers & Pages → Create application**. Essa tela abre no **Workers**: role até o fim e
   clique em **Get started** em *"Looking to deploy Pages?"*. Depois, **Import an existing Git
   repository**, conecte o GitHub e escolha `Terna`.
3. Preencha (sem espaço antes nem depois de cada valor):
   - **Project name:** `terna` (o endereço sai `https://terna.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** `npm ci && npm run build -w @terna/cliente`
   - **Build output directory:** `apps/cliente/dist`
   - **Root directory (advanced):** `jogo`
   - **Environment variables (advanced):** `NODE_VERSION` = `22`
4. **Save and Deploy**. Em uns 3 minutos o jogo está em `https://terna.pages.dev`.
5. Em **Settings → Build → Build watch paths → Edit**, troque o `*` de **Include paths** por
   `jogo/apps/cliente/*`, `jogo/packages/*`, `jogo/package.json` e `jogo/package-lock.json` (os
   caminhos contam a partir da raiz do repositório, não da pasta `jogo`). Assim, commit que não
   mexe no jogo não gasta build.

Por que Pages e não Workers: no Pages o endereço é só o nome do projeto (`terna.pages.dev`); no
Workers ele leva o subdomínio da conta (`terna.<subdominio-da-conta>.workers.dev`), que é o mesmo
de todos os Workers dela e não dá para trocar sem mudar o endereço dos outros.

### 4. Ligar um no outro

No Render, em **terna-servidor → Environment**, o **ORIGENS_PERMITIDAS** tem que ter o endereço
exato do jogo (`https://terna.pages.dev`, sem barra no fim). Mais de um endereço vai separado por
vírgula. O Render reinicia o serviço ao salvar. Sem isso o navegador bloqueia o jogo de falar com
o servidor.

### 5. E-mails — Brevo

O cadastro e o "esqueci a senha" mandam um código de 6 números por e-mail. O Render grátis
bloqueia o SMTP, então o envio é pela API do **Brevo** (grátis até 300 e-mails por dia, sem
cartão e sem domínio próprio).

1. Crie a conta em <https://www.brevo.com> e confirme o seu e-mail.
2. Em **Senders, Domains & Dedicated IPs → Senders**, adicione o e-mail que vai aparecer como
   remetente (pode ser o seu Gmail) e confirme o link que o Brevo manda para ele.
3. Em **SMTP & API → API Keys**, crie uma chave (**Generate a new API key**) e copie.
4. No Render, em **terna-servidor → Environment**, preencha:
   - **BREVO_API_KEY:** a chave do passo 3.
   - **EMAIL_REMETENTE:** o e-mail do passo 2.
5. Salve (o Render reinicia o serviço). Crie uma conta no jogo para conferir que o e-mail chega
   (olhe também o spam na primeira vez).

Sem essas duas variáveis o servidor não manda e-mail: o código aparece só no log do Render. Em casa
(`npm run dev`) é assim que se testa: o código aparece no terminal do servidor **e na própria tela
do código**, numa faixa amarela com o botão "Usar" (só com o servidor em casa, sem `DATABASE_URL`
e sem o Brevo; no site publicado essa faixa não existe).

Para receber o e-mail de verdade testando em casa, crie `jogo/apps/servidor/.env` (copie o
`.env.exemplo`) com `BREVO_API_KEY` e `EMAIL_REMETENTE` preenchidos e suba o servidor de novo.

### Conta mestre

A conta do e-mail oficial do jogo, **ternaofcl@gmail.com**, é mestre: depois de confirmar o e-mail
(no cadastro normal), ela aparece com o selo **Mestre** na tela inicial e tem tudo liberado para
testar — o Anjo na escolha de personagem (sozinho) e, nas partidas que não são online, os atalhos
**K** (energia cheia), **L** (recargas zeradas) e **H** (vida cheia). Ninguém vira mestre só
digitando o e-mail: o código precisa chegar nele. Para trocar ou acrescentar contas mestre, a
variável `EMAILS_MESTRE` do servidor (separados por vírgula).

No **Perfil** (botão no canto de cima da tela inicial), a conta dona pode **desligar o modo mestre**
para testar como uma conta comum (com o prazo de 30 dias para trocar o nome e sem o Anjo nem os
atalhos) e ligar de novo quando quiser.

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
| Cloudflare: acessos ao jogo | ilimitado | — | só arquivos estáticos (grátis e sem limite no Pages). |
| Cloudflare: builds | 500 por mês | 1 por push que mexe no jogo | build watch paths do passo 3. |

E o que **não** foi usado de propósito: o Postgres grátis do **Render** (esse sim apaga o
banco 30 dias depois de criado) e o disco do servidor (é apagado a cada reinício, por isso o
PGlite só é usado no seu computador).

### O que ainda pode derrubar (e como perceber)

- **Primeiro acesso lento:** o servidor grátis dorme após 15 min sem ninguém. O próximo acesso
  leva ~1 min. O jogo já pede para ele acordar assim que abre, então quando o jogador chegar
  na parte online ele costuma estar de pé. Isso é espera, não queda. Um jogador conectado no
  multiplayer mantém o servidor acordado.
- **Multiplayer consumindo os 5 GB:** cada estado enviado é repassado ao outro jogador. Na 1v1,
  cada um manda até ~20 estados por segundo andando e ~5 parado, de ~300 bytes: uma partida gasta
  ~30 a 45 MB por hora de saída (os pings do batimento são poucos bytes): dá ~110 a 160 h de
  partida por mês. Se o jogo crescer, é o primeiro limite a olhar.
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
- **Domínio próprio** (ex.: `terna.com.br`): dá para apontar para o Cloudflare Pages de graça
  (só paga o domínio), em **terna → Custom domains**. Aí acrescente o domínio em
  `ORIGENS_PERMITIDAS` no Render e troque `terna.pages.dev` no `og:url` e no `og:image` de
  `apps/cliente/index.html` (a prévia do link compartilhado).
- **Sair do grátis:** quando precisar, um plano pago do Render tira o sono do servidor e amplia
  a banda; confira o preço atual em <https://render.com/pricing>. Neon e Cloudflare aguentam
  bastante coisa ainda no grátis.
