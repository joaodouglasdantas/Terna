// Conexão de uma partida 1v1 (WebSocket em /api/partida, sem conta). Quem cria a sala recebe o
// código; quem entra com ele faz a partida começar para os dois. Durante a partida, cada um
// manda o próprio estado e recebe o do outro.

import {
  MensagemPartidaDoServidor,
  type EstadoJogador,
  type MensagemPartidaDoCliente,
  type PedidoPartida,
} from '@terna/compartilhado';
import { BASE_API } from './endereco';

export interface ConexaoPartida {
  // Troca quem recebe as mensagens (a tela de espera, depois o jogo). `aoFechar` recebe o
  // último erro que o servidor mandou, se mandou algum.
  ouvir(aoReceber: (mensagem: MensagemPartidaDoServidor) => void, aoFechar?: (erro: string | null) => void): void;
  enviar(estado: EstadoJogador): void;
  fechar(): void;
}

export function conectarPartida(pedido: PedidoPartida): ConexaoPartida {
  const url = new URL(BASE_API + '/partida', window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  for (const [chave, valor] of Object.entries(pedido)) url.searchParams.set(chave, valor);

  const socket = new WebSocket(url);
  let receber: (mensagem: MensagemPartidaDoServidor) => void = () => undefined;
  let fechou: ((erro: string | null) => void) | undefined;
  let ultimoErro: string | null = null;
  let fechadaPorMim = false;

  socket.addEventListener('message', (evento) => {
    let json: unknown;
    try {
      json = JSON.parse(String(evento.data));
    } catch {
      return;
    }
    const mensagem = MensagemPartidaDoServidor.safeParse(json);
    if (!mensagem.success) return;
    if (mensagem.data.tipo === 'erro') ultimoErro = mensagem.data.erro;
    receber(mensagem.data);
  });
  socket.addEventListener('close', () => {
    if (!fechadaPorMim) fechou?.(ultimoErro);
  });

  return {
    ouvir(aoReceber, aoFechar) {
      receber = aoReceber;
      fechou = aoFechar;
    },
    enviar(estado) {
      const mensagem: MensagemPartidaDoCliente = { tipo: 'estado', estado };
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(mensagem));
    },
    fechar() {
      fechadaPorMim = true;
      socket.close(1000, 'saiu');
    },
  };
}
