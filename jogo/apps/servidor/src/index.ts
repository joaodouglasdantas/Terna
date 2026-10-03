// Sobe o servidor do jogo: lê a configuração, abre o banco, aplica as migrações
// pendentes e começa a atender em PORTA.
import { criarApp } from './app';
import { apagarCodigosEcadastrosVencidos } from './auth/codigos';
import { apagarSessoesVencidas } from './auth/sessoes';
import { abrirBanco } from './banco/conexao';
import { carregarArquivoEnv, lerConfig } from './config';
import { correioBrevo, correioDoTerminal } from './email/correio';
import { criarTurn } from './partida/turn';

carregarArquivoEnv();
const config = lerConfig();
const conexao = await abrirBanco({ url: config.bancoUrl, pasta: config.pastaBanco, pastaMigracoes: config.pastaMigracoes });
await conexao.migrar();
await apagarSessoesVencidas(conexao.banco);
await apagarCodigosEcadastrosVencidos(conexao.banco);

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
  // Sem a chave do Brevo, os códigos aparecem aqui no terminal em vez de ir por e-mail.
  correio: config.brevo ? correioBrevo(config.brevo) : correioDoTerminal(),
  urlDoJogo: config.urlDoJogo,
  mestres: config.mestres,
  codigosNaTela: config.codigosNaTela,
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
if (!config.brevo) app.log.warn('sem BREVO_API_KEY e EMAIL_REMETENTE: os códigos de e-mail vão aparecer aqui no terminal');
if (config.codigosNaTela) app.log.warn('modo de teste em casa: a tela do código do jogo mostra o código (sem e-mail de verdade)');
