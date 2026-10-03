import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  porta: number;
  host: string;
  // Postgres de verdade; null = PGlite embutido em `pastaBanco` ('memoria' = só na memória).
  bancoUrl: string | null;
  pastaBanco: string;
  pastaMigracoes: string;
  origens: string[];
  diasSessao: number;
  // Atrás de um proxy (Render, Cloudflare...): usa o IP real do jogador do X-Forwarded-For
  // (o limite de tentativas de login é por IP).
  confiarProxy: boolean;
  // A chave do TURN do Cloudflare (painel → Realtime → TURN Server): TURN_KEY_ID e
  // TURN_KEY_API_TOKEN. Sem as duas, null (as partidas online ficam só com o STUN).
  turn: { id: string; token: string } | null;
  // O Brevo, que manda os e-mails com os códigos (email/correio.ts): BREVO_API_KEY e
  // EMAIL_REMETENTE (o remetente verificado no Brevo). Sem eles, null: os códigos aparecem no
  // terminal do servidor em vez de ir por e-mail.
  brevo: { chave: string; remetente: string; nomeRemetente: string } | null;
  // O endereço do jogo publicado: a logo dos e-mails vem de lá (URL_DO_JOGO).
  urlDoJogo: string;
  // As contas mestre (EMAILS_MESTRE, separados por vírgula): a oficial do jogo, com tudo liberado.
  mestres: Set<string>;
  // O servidor em casa (sem DATABASE_URL) e sem o Brevo: o jogo mostra o código na tela.
  codigosNaTela: boolean;
}

// Pasta do pacote do servidor (onde está o package.json), venha o código de src/ ou de dist/.
function raizDoPacote(): string {
  let pasta = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(pasta, 'package.json'))) {
    const acima = dirname(pasta);
    if (acima === pasta) throw new Error('não achei o package.json do servidor');
    pasta = acima;
  }
  return pasta;
}

// A conta oficial do jogo: mestre sempre, a não ser que EMAILS_MESTRE diga outra coisa.
export const EMAIL_OFICIAL = 'ternaofcl@gmail.com';

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raiz = raizDoPacote();
  const numero = (valor: string | undefined, padrao: number): number => {
    const n = Number(valor);
    return valor && Number.isFinite(n) ? n : padrao;
  };
  const pastaBanco = env.PASTA_BANCO || './dados/banco';
  return {
    // PORTA no nosso .env; PORT é a que o Render (e quase todo host) informa.
    porta: numero(env.PORTA || env.PORT, 3001),
    host: env.HOST || '127.0.0.1',
    bancoUrl: env.DATABASE_URL || null,
    pastaBanco: pastaBanco === 'memoria' ? pastaBanco : resolve(raiz, pastaBanco),
    pastaMigracoes: join(raiz, 'drizzle'),
    origens: (env.ORIGENS_PERMITIDAS || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    diasSessao: numero(env.DIAS_SESSAO, 30),
    confiarProxy: env.CONFIAR_PROXY === '1',
    turn: env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN ? { id: env.TURN_KEY_ID.trim(), token: env.TURN_KEY_API_TOKEN.trim() } : null,
    brevo:
      env.BREVO_API_KEY && env.EMAIL_REMETENTE
        ? { chave: env.BREVO_API_KEY.trim(), remetente: env.EMAIL_REMETENTE.trim(), nomeRemetente: env.NOME_REMETENTE?.trim() || 'Terna' }
        : null,
    urlDoJogo: (env.URL_DO_JOGO || 'https://terna.pages.dev').trim(),
    mestres: new Set(
      (env.EMAILS_MESTRE || EMAIL_OFICIAL)
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
    codigosNaTela: !env.DATABASE_URL && !(env.BREVO_API_KEY && env.EMAIL_REMETENTE),
  };
}

// Lê o .env da pasta do servidor, se existir (Node 22+ faz isso sem biblioteca).
export function carregarArquivoEnv(): void {
  const arquivo = join(raizDoPacote(), '.env');
  if (existsSync(arquivo)) process.loadEnvFile(arquivo);
}
