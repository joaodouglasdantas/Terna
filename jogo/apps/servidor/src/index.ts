// Sobe o servidor do jogo: lê a configuração, abre o banco, aplica as migrações
// pendentes e começa a atender em PORTA.
import { criarApp } from './app';
import { apagarSessoesVencidas } from './auth/sessoes';
import { abrirBanco } from './banco/conexao';
import { carregarArquivoEnv, lerConfig } from './config';
import { criarTurn } from './partida/turn';

carregarArquivoEnv();
const config = lerConfig();
const conexao = await abrirBanco({ url: config.bancoUrl, pasta: config.pastaBanco, pastaMigracoes: config.pastaMigracoes });
await conexao.migrar();
await apagarSessoesVencidas(conexao.banco);

// O TURN pede as credenciais ao Cloudflare antes de a primeira partida precisar delas.
let app: Awaited<ReturnType<typeof criarApp>> | null = null;
const turn = criarTurn(config.turn, { registro: { warn: (objeto, mensagem) => app?.log.warn(objeto, mensagem) } });
app = await criarApp({
  banco: conexao.banco,
  origens: config.origens,
  diasSessao: config.diasSessao,
  confiarProxy: config.confiarProxy,
  logger: { level: process.env.LOG ?? 'info' },
  turn,
});

const encerrar = async (): Promise<void> => {
  turn.parar();
  await app?.close();
  await conexao.fechar();
  process.exit(0);
};
process.once('SIGINT', encerrar);
process.once('SIGTERM', encerrar);

await app.listen({ port: config.porta, host: config.host });
app.log.info(`banco: ${conexao.tipo === 'pglite' ? `PGlite em ${config.pastaBanco}` : 'Postgres'}`);
