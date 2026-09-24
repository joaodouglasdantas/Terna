// Conexão de tempo real (multiplayer): um WebSocket autenticado pelo token da sessão.
// Quem usa escuta as mensagens com `aoReceber` e manda a própria posição com `enviar`.

import { MensagemDoServidor, type MensagemDoCliente } from '@terna/compartilhado';
import { tokenAtual } from './api';
import { BASE_API } from './endereco';

export interface ConexaoTempoReal {
  enviar(mensagem: MensagemDoCliente): void;
  fechar(): void;
}

export function conectarTempoReal(
  aoReceber: (mensagem: MensagemDoServidor) => void,
  aoFechar?: (motivo: string) => void,
): ConexaoTempoReal {
  const token = tokenAtual();
  if (!token) throw new Error('entre na conta antes de conectar ao tempo real');

  const url = new URL(BASE_API + '/tempo-real', window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);

  const socket = new WebSocket(url);
  socket.addEventListener('message', (evento) => {
    let json: unknown;
    try {
      json = JSON.parse(String(evento.data));
    } catch {
      return;
    }
    const mensagem = MensagemDoServidor.safeParse(json);
    if (mensagem.success) aoReceber(mensagem.data);
  });
  socket.addEventListener('close', (evento) => aoFechar?.(evento.reason || `código ${evento.code}`));

  return {
    enviar(mensagem) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(mensagem));
    },
    fechar() {
      socket.close(1000, 'saiu');
    },
  };
}
