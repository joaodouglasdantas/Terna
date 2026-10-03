// Cliente HTTP da API do jogo (o endereço vem de endereco.ts).

import {
  CodigoEnviado,
  Erro,
  Jogador,
  LinhaRanking,
  Save,
  Sessao,
  type ConfirmarEmail,
  type CriarConta,
  type DadosSave,
  type Entrar,
  type EnviarPontuacao,
  type TrocarSenha,
} from '@terna/compartilhado';
import { z } from 'zod';
import { BASE_API as BASE } from './endereco';

// `status` 0: nem chegou ao servidor (sem internet, servidor fora do ar).
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

let token: string | null = null;

export function definirToken(novo: string | null): void {
  token = novo;
}

export function tokenAtual(): string | null {
  return token;
}

async function pedir<T>(metodo: string, caminho: string, esquema: z.ZodType<T>, corpo?: unknown): Promise<T> {
  const cabecalhos: Record<string, string> = {};
  if (corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  if (token) cabecalhos.authorization = `Bearer ${token}`;
  let resposta: Response;
  try {
    resposta = await fetch(BASE + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi(0, 'não consegui falar com o servidor; confira a internet e tente de novo');
  }
  const json: unknown = resposta.status === 204 ? undefined : await resposta.json().catch(() => undefined);
  if (!resposta.ok) {
    const erro = Erro.safeParse(json);
    throw new ErroApi(resposta.status, erro.success ? erro.data.erro : `erro ${resposta.status}`);
  }
  return esquema.parse(json);
}

const Nada = z.undefined();

// Toda resposta que abre uma sessão já passa a mandar o token nos pedidos seguintes.
async function abrirSessao(caminho: string, corpo: unknown): Promise<Sessao> {
  const sessao = await pedir('POST', caminho, Sessao, corpo);
  definirToken(sessao.token);
  return sessao;
}

export const api = {
  // O cadastro manda o código para o e-mail; a sessão só abre ao confirmar.
  criarConta: (dados: CriarConta): Promise<CodigoEnviado> => pedir('POST', '/contas', CodigoEnviado, dados),
  confirmarEmail: (dados: ConfirmarEmail): Promise<Sessao> => abrirSessao('/contas/confirmar', dados),
  reenviarCodigo: (email: string): Promise<CodigoEnviado> => pedir('POST', '/contas/reenviar', CodigoEnviado, { email }),
  // 403: o e-mail ainda não foi confirmado (o servidor manda um código novo).
  entrar: (dados: Entrar): Promise<Sessao> => abrirSessao('/sessoes', dados),
  esqueciSenha: (email: string): Promise<CodigoEnviado> => pedir('POST', '/senha/esqueci', CodigoEnviado, { email }),
  trocarSenha: (dados: TrocarSenha): Promise<Sessao> => abrirSessao('/senha/trocar', dados),
  async sair(): Promise<void> {
    try {
      await pedir('DELETE', '/sessoes', Nada);
    } finally {
      definirToken(null);
    }
  },
  eu: (): Promise<Jogador> => pedir('GET', '/eu', Jogador),
  listarSaves: (): Promise<Save[]> => pedir('GET', '/saves', z.array(Save)),
  carregarSave: (slot: number): Promise<Save> => pedir('GET', `/saves/${slot}`, Save),
  gravarSave: (slot: number, dados: DadosSave): Promise<Save> => pedir('PUT', `/saves/${slot}`, Save, dados),
  ranking: (categoria: string): Promise<LinhaRanking[]> =>
    pedir('GET', `/ranking/${encodeURIComponent(categoria)}`, z.array(LinhaRanking)),
  enviarPontuacao: (dados: EnviarPontuacao): Promise<void> => pedir('POST', '/ranking', Nada, dados),
};
