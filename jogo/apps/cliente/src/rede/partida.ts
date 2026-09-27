// Conexão de uma partida 1v1 (WebSocket em /api/partida, sem conta). Quem cria a sala recebe o
// código; quem entra com ele completa a sala, os dois escolhem o personagem e a partida começa
// para os dois. Durante a partida, cada um
// manda o próprio estado (e os poderes e golpes que usa) e recebe os do outro. As armas do mapa
// são do servidor: ele avisa as que caem e quem pega; daqui só se pede.
//
// Na mesma rede (a partida hospedada), os dois computadores se ligam direto (direto.ts) e o estado,
// os poderes e os golpes vão por essa ligação; o resto (armas, tempo, fim) continua no servidor.
// Sem ela abrir, tudo vai pelo servidor.

import {
  MensagemPartidaDoServidor,
  PartidasNaRede,
  type AtaqueUsado,
  type EstadoJogador,
  type Heroi,
  type MensagemPartidaDoCliente,
  type PartidaNaRede,
  type PedidoPartida,
  type PoderUsado,
} from '@terna/compartilhado';
import { ligarDireto, type LigacaoDireta } from './direto';
import { BASE_API } from './endereco';

// As partidas hospedadas na sua rede, esperando alguém (a lista da tela Na mesma rede).
export async function buscarPartidasNaRede(): Promise<PartidaNaRede[]> {
  const resposta = await fetch(BASE_API + '/partida/rede');
  if (!resposta.ok) throw new Error(`status ${resposta.status}`);
  return PartidasNaRede.parse(await resposta.json()).partidas;
}

// O que pode chegar pela ligação direta: só o que o outro mandaria (o resto é do servidor).
const PELA_LIGACAO = new Set(['estado', 'poder', 'golpe']);

// Bytes esperando para sair a partir dos quais um estado novo não entra na fila: a rede está
// engasgada, e o próximo estado (50 ms depois) já é mais novo. Poderes, golpes e armas sempre vão.
const FILA_MAXIMA = 8 * 1024;

export interface ConexaoPartida {
  // Troca quem recebe as mensagens (a tela de espera, depois o jogo). `aoFechar` recebe o
  // último erro que o servidor mandou, se mandou algum.
  ouvir(aoReceber: (mensagem: MensagemPartidaDoServidor) => void, aoFechar?: (erro: string | null) => void): void;
  // Com os dois na sala: o personagem escolhido (mandar de novo troca, até o outro escolher).
  escolherHeroi(heroi: Heroi): void;
  // Ligados direto pela rede local (o estado, os poderes e os golpes não passam pelo servidor).
  direta(): boolean;
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
  let ligacao: LigacaoDireta | null = null;

  const ler = (texto: string): MensagemPartidaDoServidor | null => {
    try {
      const mensagem = MensagemPartidaDoServidor.safeParse(JSON.parse(texto));
      return mensagem.success ? mensagem.data : null;
    } catch {
      return null;
    }
  };
  const mandar = (mensagem: MensagemPartidaDoCliente): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(mensagem));
  };
  // Pela ligação direta, se estiver aberta; senão, pelo servidor.
  const mandarRapido = (mensagem: MensagemPartidaDoCliente): void => {
    if (ligacao?.enviar(JSON.stringify(mensagem))) return;
    mandar(mensagem);
  };
  // Quem hospedou oferece a ligação; quem entrou espera a oferta. Na revanche, a que ainda está de
  // pé continua; a que não abriu (ou caiu) é tentada de novo.
  const ligar = (oferece: boolean): void => {
    if (ligacao && !ligacao.morta()) return;
    ligacao?.fechar();
    ligacao = ligarDireto(
      oferece,
      (sinal) => mandar({ tipo: 'sinal', sinal }),
      (texto) => {
        const m = ler(texto);
        if (m && PELA_LIGACAO.has(m.tipo)) receber(m);
      },
    );
  };

  socket.addEventListener('message', (evento) => {
    const mensagem = ler(String(evento.data));
    if (!mensagem) return;
    if (mensagem.tipo === 'erro') ultimoErro = mensagem.erro;
    if (mensagem.tipo === 'escolher' && mensagem.direto) ligar(mensagem.lado === 'anfitriao');
    if (mensagem.tipo === 'sinal') {
      if (mensagem.sinal.descricao?.type === 'offer' && (!ligacao || ligacao.morta())) ligar(false);
      ligacao?.receberSinal(mensagem.sinal);
      return;
    }
    receber(mensagem);
  });
  socket.addEventListener('close', () => {
    ligacao?.fechar();
    if (!fechadaPorMim) fechou?.(ultimoErro);
  });

  return {
    ouvir(aoReceber, aoFechar) {
      receber = aoReceber;
      fechou = aoFechar;
    },
    escolherHeroi(heroi) {
      mandar({ tipo: 'heroi', heroi });
    },
    direta: () => ligacao?.aberta() ?? false,
    enviar(estado) {
      if (ligacao?.enviar(JSON.stringify({ tipo: 'estado', estado }))) return;
      if (socket.bufferedAmount > FILA_MAXIMA) return;
      mandar({ tipo: 'estado', estado });
    },
    enviarPoder(uso) {
      mandarRapido({ tipo: 'poder', uso });
    },
    enviarGolpe(uso) {
      mandarRapido({ tipo: 'golpe', uso });
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
      ligacao?.fechar();
      socket.close(1000, 'saiu');
    },
  };
}
