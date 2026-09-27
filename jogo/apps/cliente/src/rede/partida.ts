// Conexão de uma partida 1v1 (WebSocket em /api/partida, sem conta). Quem cria a sala recebe o
// código; quem entra com ele completa a sala, os dois escolhem o personagem e a partida começa
// para os dois. Durante a partida, cada um
// manda o próprio estado (e os poderes e golpes que usa) e recebe os do outro. As armas do mapa
// são do servidor: ele avisa as que caem e quem pega; daqui só se pede.

import {
  MensagemPartidaDoServidor,
  type AtaqueUsado,
  type EstadoJogador,
  type Heroi,
  type MensagemPartidaDoCliente,
  type PedidoPartida,
  type PoderUsado,
} from '@terna/compartilhado';
import { BASE_API } from './endereco';

// Bytes esperando para sair a partir dos quais um estado novo não entra na fila: a rede está
// engasgada, e o próximo estado (50 ms depois) já é mais novo. Poderes, golpes e armas sempre vão.
const FILA_MAXIMA = 8 * 1024;

export interface ConexaoPartida {
  // Troca quem recebe as mensagens (a tela de espera, depois o jogo). `aoFechar` recebe o
  // último erro que o servidor mandou, se mandou algum.
  ouvir(aoReceber: (mensagem: MensagemPartidaDoServidor) => void, aoFechar?: (erro: string | null) => void): void;
  // Com os dois na sala: o personagem escolhido.
  escolherHeroi(heroi: Heroi): void;
  // O próprio estado; com a rede engasgada, fica de fora (o próximo o substitui).
  enviar(estado: EstadoJogador): void;
  enviarPoder(uso: PoderUsado): void;
  enviarGolpe(uso: AtaqueUsado): void;
  // Encostou na arma `id`: o servidor responde aos dois com `arma-pega`, se ela ainda estiver lá.
  pedirArma(id: number): void;
  // O Anjo virou anjo com ela na mão: cai no chão em `x` (o servidor avisa os dois com `arma-caiu`).
  largarArma(x: number, durabilidade: number): void;
  avisarArmaQuebrou(): void;
  // Jogou fora a arma da mão (tecla E): o servidor avisa o outro com `arma-descartada`.
  descartarArma(): void;
  // A vida chegou a 0: o servidor encerra a partida para os dois, com o outro de vencedor.
  enviarMorte(): void;
  // Depois do fim: quer jogar de novo com o mesmo oponente (os dois pedindo, a escolha volta).
  pedirRevanche(): void;
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

  const mandar = (mensagem: MensagemPartidaDoCliente): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(mensagem));
  };

  return {
    ouvir(aoReceber, aoFechar) {
      receber = aoReceber;
      fechou = aoFechar;
    },
    escolherHeroi(heroi) {
      mandar({ tipo: 'heroi', heroi });
    },
    enviar(estado) {
      if (socket.bufferedAmount > FILA_MAXIMA) return;
      mandar({ tipo: 'estado', estado });
    },
    enviarPoder(uso) {
      mandar({ tipo: 'poder', uso });
    },
    enviarGolpe(uso) {
      mandar({ tipo: 'golpe', uso });
    },
    pedirArma(id) {
      mandar({ tipo: 'pegar-arma', id });
    },
    largarArma(x, durabilidade) {
      mandar({ tipo: 'largar-arma', x, durabilidade });
    },
    avisarArmaQuebrou() {
      mandar({ tipo: 'arma-quebrou' });
    },
    descartarArma() {
      mandar({ tipo: 'descartar-arma' });
    },
    enviarMorte() {
      mandar({ tipo: 'morri' });
    },
    pedirRevanche() {
      mandar({ tipo: 'revanche' });
    },
    fechar() {
      fechadaPorMim = true;
      socket.close(1000, 'saiu');
    },
  };
}
