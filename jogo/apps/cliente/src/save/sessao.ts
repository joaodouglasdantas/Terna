// A sessão da conta, lembrada neste navegador: quem entrou uma vez não precisa digitar a senha a
// cada visita (o servidor aceita o token por DIAS_SESSAO dias). Fica só o token e o jogador; a
// senha nunca. Sem "Manter conectado", vale só enquanto a aba estiver aberta (sessionStorage). Sem
// armazenamento (aba anônima, bloqueado), vale só nesta visita.

import { Jogador, Sessao } from '@terna/compartilhado';
import { z } from 'zod';
import { api, definirToken, ErroApi } from '../rede/api';

const CHAVE = 'terna:sessao';

const Guardada = z.object({ token: z.string(), jogador: Jogador });

// Quem está na conta agora (null: ninguém).
let atual: Jogador | null = null;

export function contaAtual(): Jogador | null {
  return atual;
}

// A conta oficial do jogo: tudo liberado para testar (o servidor diz quem é).
export function souMestre(): boolean {
  return atual?.mestre === true;
}

function lugares(): Storage[] {
  const lista: Storage[] = [];
  try {
    lista.push(localStorage);
  } catch {
    // sem armazenamento
  }
  try {
    lista.push(sessionStorage);
  } catch {
    // sem armazenamento
  }
  return lista;
}

// `lembrar`: guarda para as próximas visitas (senão, só até fechar a aba).
export function guardarSessao(sessao: Sessao, lembrar = true): void {
  definirToken(sessao.token);
  atual = sessao.jogador;
  const texto = JSON.stringify({ token: sessao.token, jogador: sessao.jogador });
  for (const lugar of lugares()) {
    try {
      lugar.removeItem(CHAVE);
    } catch {
      // nada guardado
    }
  }
  try {
    (lembrar ? localStorage : sessionStorage).setItem(CHAVE, texto);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

// A conta mudou (o perfil: nome, ícone, modo mestre): guarda a nova no mesmo lugar, com o mesmo
// token.
export function atualizarConta(jogador: Jogador): void {
  const lida = lerGuardada();
  if (lida) guardarSessao({ token: lida.guardada.token, expiraEm: '', jogador }, lida.lembrar);
  atual = jogador;
}

export function esquecerSessao(): void {
  definirToken(null);
  atual = null;
  for (const lugar of lugares()) {
    try {
      lugar.removeItem(CHAVE);
    } catch {
      // nada guardado
    }
  }
}

function lerGuardada(): { guardada: z.infer<typeof Guardada>; lembrar: boolean } | null {
  for (const lugar of lugares()) {
    try {
      const valida = Guardada.safeParse(JSON.parse(lugar.getItem(CHAVE) ?? 'null'));
      if (valida.success) return { guardada: valida.data, lembrar: lugar === localStorage };
    } catch {
      // guardado estragado: segue procurando
    }
  }
  return null;
}

// A sessão guardada, se ainda vale: pergunta ao servidor quem é (o nome pode ter mudado). Token
// vencido ou recusado, esquece. Sem resposta do servidor, usa a guardada mesmo (o jogo segue; o
// que precisar do servidor avisa depois).
export async function retomarSessao(): Promise<Jogador | null> {
  const lida = lerGuardada();
  if (!lida) return null;
  const { guardada, lembrar } = lida;
  definirToken(guardada.token);
  try {
    const jogador = await api.eu();
    guardarSessao({ token: guardada.token, expiraEm: '', jogador }, lembrar);
    return jogador;
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 0) {
      atual = guardada.jogador;
      return guardada.jogador;
    }
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
