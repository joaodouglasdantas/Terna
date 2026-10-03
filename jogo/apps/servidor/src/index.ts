// Sobe o servidor do jogo: lê a configuração, abre o banco, aplica as migrações
// pendentes e começa a atender em PORTA.
import { criarApp } from './app';
import { apagarCodigosEcadastrosVencidos } from './auth/codigos';
import { apagarSessoesVencidas } from './auth/sessoes';
import { abrirBanco } from './banco/conexao';
import { carregarArquivoEnv, lerConfig } from './config';
import { correioBrevo, correioDoTerminal } from './email/correio';
import { criarTurn } from './partida/turn';

// O banco local (PGlite) não abrindo quase sempre é a pasta dele estragada: o servidor fechou no
// meio de uma escrita (a janela do terminal fechada, o computador desligado) ou o OneDrive mexeu
// nos arquivos enquanto ele escrevia. Ela só guarda as contas de teste deste computador: em vez do
// erro do WebAssembly, o servidor diz o que fazer.
async function abrirBancoOuExplicar(): Promise<Awaited<ReturnType<typeof abrirBanco>>> {
  try {
    return await abrirBanco({ url: config.bancoUrl, pasta: config.pastaBanco, pastaMigracoes: config.pastaMigracoes });
  } catch (erro) {
    if (config.bancoUrl) throw erro; // o Postgres de verdade: o erro dele já diz o que é
    const linha = '='.repeat(72);
    console.error(
      [
        '',
        linha,
        'O banco local do servidor não abriu.',
        `Pasta: ${config.pastaBanco}`,
        '',
        'Ele provavelmente ficou estragado: o servidor fechou no meio de uma escrita, ou o',
        'OneDrive mexeu nos arquivos dele. Esse banco só guarda as contas de teste deste',
        'computador. Para começar um banco novo:',
        '  1. feche o servidor (e qualquer outra janela do jogo rodando);',
        '  2. renomeie a pasta acima, por exemplo para "banco-velho" (ou apague);',
        '  3. rode o jogo de novo: o servidor cria um banco novo, vazio.',
        linha,
        '',
      ].join('\n'),
    );
    console.error(erro);
    process.exit(1);
  }
}

carregarArquivoEnv();
const config = lerConfig();
const conexao = await abrirBancoOuExplicar();
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
