// O sósia: um personagem idêntico a você que anda sozinho pelo mapa. Ele não tem física nem
// desenho próprios — o corpo é o mesmo seu (entidades/personagem.ts), então anda, pula, vira
// anjo e plana exatamente como você. O cérebro daqui só decide, a cada quadro, que botões
// apertar: anda até um lugar perto de casa, para um pouco, pula de vez em quando e, de tempos
// em tempos, vira anjo (e aí voa, plana e às vezes solta o botão no meio) ou volta.

import { MUNDO, type Intervalo } from '@terna/compartilhado';
import { sortear } from '../motor/matematica';
import { formaDo, personagemLivre, type Controles, type Forma, type Personagem } from './personagem';

const SOSIA = {
  raio: 150, // pixels: escolhe para onde andar até esta distância de casa, para os dois lados
  andarNoMinimo: 40, // pixels: nenhuma caminhada é mais curta que isto
  parado: [1, 3.5] as Intervalo, // segundos parado entre uma caminhada e outra
  // Segundos até o próximo pulo (com os pés no chão) e quanto tempo segura o botão. Na forma
  // base, de um toque ao pulo longo; de anjo, sobe e plana — um voo inteiro, subindo e planando
  // até o chão, leva ~3,3 s: segurando menos que isso ele solta no meio do voo e despenca.
  pulo: { base: [2.5, 7], anjo: [1.5, 4] } as Record<Forma, Intervalo>,
  segurar: { base: [0.05, 0.4], anjo: [0.9, 4.5] } as Record<Forma, Intervalo>,
  // Segundos em cada forma. De anjo, às vezes passa do minuto (DURACAO_ANJO) e o tempo acaba
  // antes: ele volta sozinho.
  forma: { base: [10, 25], anjo: [20, 75] } as Record<Forma, Intervalo>,
};

export interface CerebroSosia {
  casa: number; // x no mapa em volta do qual ele anda
  alvo: number | null; // x para onde está andando; null = parado
  espera: number; // segundos parado até escolher outro lugar
  ateOPulo: number; // segundos no chão até o próximo pulo
  segurando: number; // segundos que ainda segura o botão de pulo
  forma: Forma; // a forma em que ele se viu da última vez
  ateTrocar: number; // segundos até trocar de forma
}

export function criarCerebroSosia(casa: number): CerebroSosia {
  return {
    casa,
    alvo: null,
    espera: sortear(SOSIA.parado),
    ateOPulo: sortear(SOSIA.pulo.base),
    segurando: 0,
    forma: 'base',
    ateTrocar: sortear(SOSIA.forma.base),
  };
}

// Um ponto perto de casa e não perto demais de onde ele está.
function escolherDestino(c: CerebroSosia, x: number): number {
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const alvo = Math.max(30, Math.min(MUNDO - 30, c.casa + sortear([-SOSIA.raio, SOSIA.raio])));
    if (Math.abs(alvo - x) >= SOSIA.andarNoMinimo) return alvo;
  }
  return c.casa;
}

export function pensarSosia(c: CerebroSosia, corpo: Personagem, dt: number): Controles {
  const controles: Controles = { esquerda: false, direita: false, pular: false, transformar: false };
  // Transformando, o corpo não responde: espera a luz passar.
  if (!personagemLivre(corpo)) return controles;
  const forma = formaDo(corpo);

  // Mudou de forma (pelo R dele ou porque o minuto de anjo acabou): sorteia quanto fica nesta.
  if (forma !== c.forma) {
    c.forma = forma;
    c.ateTrocar = sortear(SOSIA.forma[forma]);
  }
  // Troca de forma só com os pés no chão e sem pulo em curso. Aperta R por um quadro só: no
  // seguinte o corpo já está transformando e o cérebro espera (e, se o aperto não pegou, solta
  // o botão antes de apertar de novo).
  c.ateTrocar -= dt;
  if (c.ateTrocar <= 0 && corpo.noChao && c.segurando <= 0 && !corpo.transformarSegurado) {
    controles.transformar = true;
    return controles;
  }

  if (c.alvo === null) {
    c.espera -= dt;
    if (c.espera <= 0) c.alvo = escolherDestino(c, corpo.x);
  } else if (Math.abs(c.alvo - corpo.x) < 2) {
    c.alvo = null;
    c.espera = sortear(SOSIA.parado);
  } else {
    controles.direita = c.alvo > corpo.x;
    controles.esquerda = !controles.direita;
  }

  // O botão fica solto pelo menos um quadro entre dois pulos: o corpo só pula ao apertar de novo.
  if (c.segurando > 0) {
    c.segurando -= dt;
    controles.pular = true;
  } else if (corpo.noChao) {
    c.ateOPulo -= dt;
    if (c.ateOPulo <= 0) {
      c.segurando = sortear(SOSIA.segurar[forma]);
      c.ateOPulo = sortear(SOSIA.pulo[forma]);
      controles.pular = true;
    }
  }
  return controles;
}
