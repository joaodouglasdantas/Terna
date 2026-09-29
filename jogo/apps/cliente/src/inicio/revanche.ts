// Online, depois do fim (por tempo ou morte): a sala continua aberta e os dois podem jogar de novo
// sem voltar ao menu. Quem clica em "Jogar novamente" pede a revanche; o outro vê o pedido e,
// clicando também, aceita — aí o servidor manda os dois de volta à escolha de personagem, na
// mesma sala. Se o outro sair (ou a sala fechar), o pedido não vale mais.

import type { MensagemPartidaDoServidor } from '@terna/compartilhado';
import type { ConexaoPartida } from '../rede/partida';

export interface Revanche {
  oponente: string;
  pedi: boolean; // você já pediu
  outroQuer: boolean; // o outro já pediu
  saiu: boolean; // o outro saiu (ou a sala fechou): não dá mais
  pedir(): void;
  aoMudar: (() => void) | null;
  // Os dois pediram: chega a escolha de personagem, com prazo (`prazoAte`, em performance.now()).
  // `pendentes` guarda o que a sala mandar até a tela de seleção abrir (o outro pode escolher antes).
  pronta: Promise<void>;
  prazoAte: number;
  pendentes: MensagemPartidaDoServidor[];
}

export function ouvirRevanche(conexao: ConexaoPartida, oponente: string): Revanche {
  let liberar: () => void = () => undefined;
  let escolhendo = false;
  const r: Revanche = {
    oponente,
    pedi: false,
    outroQuer: false,
    saiu: false,
    aoMudar: null,
    pronta: new Promise((resolver) => (liberar = resolver)),
    prazoAte: 0,
    pendentes: [],
    pedir() {
      if (r.pedi || r.saiu) return;
      r.pedi = true;
      conexao.pedirRevanche();
      r.aoMudar?.();
    },
  };
  const acabou = (): void => {
    if (escolhendo) return;
    r.saiu = true;
    r.aoMudar?.();
  };
  conexao.ouvir((m) => {
    if (escolhendo) {
      r.pendentes.push(m);
      return;
    }
    if (m.tipo === 'revanche') {
      r.outroQuer = true;
      r.aoMudar?.();
    } else if (m.tipo === 'escolher') {
      escolhendo = true;
      r.prazoAte = performance.now() + m.prazoMs;
      liberar();
    } else if (m.tipo === 'fim' || m.tipo === 'erro') {
      acabou();
    }
  }, acabou);
  return r;
}
