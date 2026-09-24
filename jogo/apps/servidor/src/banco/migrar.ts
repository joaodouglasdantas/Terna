// `npm run db:migrar`: aplica as migrações pendentes e sai. O servidor também faz isso
// sozinho ao subir; este comando serve para rodar a migração antes, num deploy.
import { carregarArquivoEnv, lerConfig } from '../config';
import { abrirBanco } from './conexao';

carregarArquivoEnv();
const config = lerConfig();
const conexao = await abrirBanco({ url: config.bancoUrl, pasta: config.pastaBanco, pastaMigracoes: config.pastaMigracoes });
await conexao.migrar();
await conexao.fechar();
console.log(`migrações aplicadas (${conexao.tipo})`);
