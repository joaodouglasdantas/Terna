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
  };
}

// Lê o .env da pasta do servidor, se existir (Node 22+ faz isso sem biblioteca).
export function carregarArquivoEnv(): void {
  const arquivo = join(raizDoPacote(), '.env');
  if (existsSync(arquivo)) process.loadEnvFile(arquivo);
}
