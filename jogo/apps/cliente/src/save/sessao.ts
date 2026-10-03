// A sessão da conta, lembrada neste navegador: quem entrou uma vez não precisa digitar a senha a
// cada visita (o servidor aceita o token por DIAS_SESSAO dias). Fica só o token e o jogador; a
// senha nunca. Sem armazenamento (aba anônima, bloqueado), vale só nesta visita.

import { Jogador, Sessao } from '@terna/compartilhado';
import { z } from 'zod';
import { api, definirToken, ErroApi } from '../rede/api';

const CHAVE = 'terna:sessao';

const Guardada = z.object({ token: z.string(), jogador: Jogador });

export function guardarSessao(sessao: Sessao): void {
  definirToken(sessao.token);
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ token: sessao.token, jogador: sessao.jogador }));
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

export function esquecerSessao(): void {
  definirToken(null);
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // nada guardado
  }
}

function lerGuardada(): z.infer<typeof Guardada> | null {
  try {
    const valida = Guardada.safeParse(JSON.parse(localStorage.getItem(CHAVE) ?? 'null'));
    return valida.success ? valida.data : null;
  } catch {
    return null;
  }
}

// A sessão guardada, se ainda vale: pergunta ao servidor quem é (o nome pode ter mudado). Token
// vencido ou recusado, esquece. Sem resposta do servidor, usa a guardada mesmo (o jogo segue; o
// que precisar do servidor avisa depois).
export async function retomarSessao(): Promise<Jogador | null> {
  const guardada = lerGuardada();
  if (!guardada) return null;
  definirToken(guardada.token);
  try {
    const jogador = await api.eu();
    guardarSessao({ token: guardada.token, expiraEm: '', jogador });
    return jogador;
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 0) return guardada.jogador;
    esquecerSessao();
    return null;
  }
}

// Sai da conta: encerra a sessão no servidor (se der) e esquece aqui.
export async function sairDaConta(): Promise<void> {
  try {
    await api.sair();
  } catch {
    // o servidor não respondeu: a sessão vence sozinha
  }
  esquecerSessao();
}
