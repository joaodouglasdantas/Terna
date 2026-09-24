// Cliente HTTP da API do jogo (o endereço vem de endereco.ts).

import {
  Erro,
  LinhaRanking,
  Save,
  Sessao,
  type CriarConta,
  type DadosSave,
  type Entrar,
  type EnviarPontuacao,
  type Jogador,
} from '@terna/compartilhado';
import { z } from 'zod';
import { BASE_API as BASE } from './endereco';

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
  const resposta = await fetch(BASE + caminho, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const json: unknown = resposta.status === 204 ? undefined : await resposta.json().catch(() => undefined);
  if (!resposta.ok) {
    const erro = Erro.safeParse(json);
    throw new ErroApi(resposta.status, erro.success ? erro.data.erro : `erro ${resposta.status}`);
  }
  return esquema.parse(json);
}

const Nada = z.undefined();

export const api = {
  async criarConta(dados: CriarConta): Promise<Sessao> {
    const sessao = await pedir('POST', '/contas', Sessao, dados);
    definirToken(sessao.token);
    return sessao;
  },
  async entrar(dados: Entrar): Promise<Sessao> {
    const sessao = await pedir('POST', '/sessoes', Sessao, dados);
    definirToken(sessao.token);
    return sessao;
  },
  async sair(): Promise<void> {
    await pedir('DELETE', '/sessoes', Nada);
    definirToken(null);
  },
  eu: (): Promise<Jogador> => pedir('GET', '/eu', z.object({ id: z.string(), nome: z.string(), criadoEm: z.string() })),
  listarSaves: (): Promise<Save[]> => pedir('GET', '/saves', z.array(Save)),
  carregarSave: (slot: number): Promise<Save> => pedir('GET', `/saves/${slot}`, Save),
  gravarSave: (slot: number, dados: DadosSave): Promise<Save> => pedir('PUT', `/saves/${slot}`, Save, dados),
  ranking: (categoria: string): Promise<LinhaRanking[]> =>
    pedir('GET', `/ranking/${encodeURIComponent(categoria)}`, z.array(LinhaRanking)),
  enviarPontuacao: (dados: EnviarPontuacao): Promise<void> => pedir('POST', '/ranking', Nada, dados),
};
