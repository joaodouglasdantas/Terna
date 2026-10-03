// A CPU (o "sósia"): um personagem sorteado, diferente do seu, que anda sozinho pelo mapa. Ele
// não tem física nem desenho próprios — o corpo é o mesmo de todos (entidades/personagem.ts),
// então anda, pula e usa os poderes exatamente como você com o mesmo personagem. O cérebro
// daqui só decide, a cada quadro, que botões apertar e onde mirar: anda por perto de você, para
// um pouco, pula de vez em quando, tenta sair de baixo das marcas dos seus poderes e pular o que
// vem voando. Vai buscar as armas que caem perto e luta com elas: com a espada chega junto; com
// o arco fica longe e atira.
// - Leslie: com uma arma boa na mão, fica no modo arma; sem ela, aperta R para o modo poderes e
//   ataca com os três quando você está no alcance (a Flor Carnívora, só com a barra de energia cheia).
// - Grow: de gente, como a Leslie (os pássaros e o vento — soprando um tempo sorteado); com a
//   barra cheia, vira golem pelo terceiro quadrinho e aí chega perto e bate com os do golem.
// - Anjo: quando a energia e a recarga deixam, vira anjo (e aí voa, plana e às vezes solta o
//   botão no meio) e ataca com os poderes dele. Com uma arma boa na mão, adia virar anjo
//   (virando, ela cairia no chão).

import {
  ARCO,
  ENERGIA_PIXY,
  IMPACTO,
  INVESTIDA,
  JULGAMENTO,
  MUNDO,
  PEDRA,
  REVOADA,
  SALTO,
  RAIZES,
  RAJADA,
  CHICOTE,
  type IdPoder,
  type Intervalo,
} from '@terna/compartilhado';
import { sortear } from '../motor/matematica';
import { ALCANCE_ANJO } from './anjo/poderes';
import { ALCANCE_GROW } from './grow/poderes';
import { ALCANCE_LESLIE } from './leslie/poderes';
import {
  armaPronta,
  custoDeEnergia,
  formaDo,
  personagemLivre,
  podePegarArma,
  podeVirarAnjo,
  podeVirarGolem,
  usaPoderes,
  type Controles,
  type Forma,
  type Modo,
  type Personagem,
} from './personagem';
import type { Ameacas } from './poderes';

const SOSIA = {
  raio: 110, // pixels: escolhe para onde andar até esta distância de casa, para os dois lados
  andarNoMinimo: 40, // pixels: nenhuma caminhada é mais curta que isto
  parado: [1, 3.5] as Intervalo, // segundos parado entre uma caminhada e outra
  // Segundos até o próximo pulo (com os pés no chão) e quanto tempo segura o botão. Na forma
  // base, de um toque ao pulo longo; de anjo, sobe e plana — um voo inteiro, subindo e planando
  // até o chão, leva ~3,3 s: segurando menos que isso ele solta no meio do voo e despenca.
  pulo: { base: [2.5, 7], anjo: [1.5, 4], golem: [3, 8] } as Record<Forma, Intervalo>,
  segurar: { base: [0.05, 0.4], anjo: [0.9, 4.5], golem: [0.05, 0.3] } as Record<Forma, Intervalo>,
  // Segundos em cada forma. Na base, conta depois de a barra de energia encher (e a recarga do
  // anjo acabar); de anjo, às vezes passa da duração (DURACAO_ANJO) e o tempo acaba antes: ele
  // volta sozinho.
  forma: { base: [1, 6], anjo: [15, 32], golem: [99, 99] } as Record<Forma, Intervalo>,
  // A casa segue você: fica a esta distância, do lado em que ele está. A Leslie e o Grow no modo
  // poderes ficam um pouco mais longe: o chicote e os pássaros alcançam. O golem chega perto.
  distancia: { base: 120, anjo: 140, golem: 70 } as Record<Forma, number>,
  distanciaPoderes: 95,
  entreAtaques: [0.6, 1.6] as Intervalo, // segundos entre uma tentativa de ataque e outra
  guardarEspecial: 0.35, // chance de guardar o especial pronto numa tentativa, para variar
  erroMira: 10, // pixels, para cada lado
  reacao: 0.25, // parte do aviso de uma marca que passa antes de ele reagir
  desvioPulo: 0.55, // chance de pular um coração que vem na direção dele
  buscarArma: 260, // pixels: vai pegar uma arma que caiu até esta distância
  guardarArma: 5, // segundos de arma: com mais que isto na mão, não vira anjo
  espada: { perto: 14, golpe: 24 }, // chega a esta distância e golpeia a partir desta
  soco: 16, // sem arma: soca quem está a esta distância (de vez em quando)
  socosPorSegundo: 2.5, // a chance, por segundo, de soltar o soco pronto com você perto
  arco: { longe: 150, de: 40, ate: 250 }, // fica a esta distância e atira neste intervalo
  entreGolpes: [0.05, 0.35] as Intervalo, // segundos de hesitação depois da arma ficar pronta
  soprar: [0.8, 2.2] as Intervalo, // segundos segurando o Vendaval
};

export interface CerebroSosia {
  casa: number; // x no mapa em volta do qual ele anda
  alvo: number | null; // x para onde está andando; null = parado
  espera: number; // segundos parado até escolher outro lugar
  ateOPulo: number; // segundos no chão até o próximo pulo
  segurando: number; // segundos que ainda segura o botão de pulo
  forma: Forma; // a forma em que ele se viu da última vez (o Anjo)
  ateTrocar: number; // segundos até trocar de forma
  ateAtacar: number; // segundos até a próxima tentativa de ataque
  ateDesviar: number; // segundos até poder decidir de novo se pula um coração
  ateGolpe: number; // segundos até atacar com a arma pronta
  soprar: number; // segundos que ainda segura o Vendaval
}

// Onde mirar e com qual poder (índice em PODERES).
export interface Mira {
  poder: number;
  x: number;
  y: number;
}

export interface DecisaoSosia {
  controles: Controles;
  mira: Mira | null;
  golpe: { x: number; y: number } | null; // atacar com a arma da mão, mirando aqui
  soltar: boolean; // soltar o botão do Vendaval
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
    ateAtacar: sortear(SOSIA.entreAtaques),
    ateDesviar: 0,
    ateGolpe: 0,
    soprar: 0,
  };
}

const noMapa = (x: number): number => Math.max(30, Math.min(MUNDO - 30, x));

// Um ponto perto de casa e não perto demais de onde ele está.
function escolherDestino(c: CerebroSosia, x: number): number {
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const alvo = noMapa(c.casa + sortear([-SOSIA.raio, SOSIA.raio]));
    if (Math.abs(alvo - x) >= SOSIA.andarNoMinimo) return alvo;
  }
  return c.casa;
}

// Até onde cada poder pega.
const ALCANCE: Record<IdPoder, number> = { ...ALCANCE_ANJO, ...ALCANCE_LESLIE, ...ALCANCE_GROW };
// O aviso de cada poder de área: a mira adianta o passo do oponente por parte dele.
const AVISO: Partial<Record<IdPoder, number>> = {
  impacto: IMPACTO.aviso,
  julgamento: JULGAMENTO.aviso,
  raizes: RAIZES.aviso,
  salto: SALTO.agachar + SALTO.voo,
  investida: INVESTIDA.preparo + 0.2,
};

// Com qual poder atacar agora, se algum estiver pronto e alcançar: o mais forte primeiro, às
// vezes guardando o especial. Os da Leslie, só com a energia de cada um.
function escolherPoder(corpo: Personagem, distancia: number): number | null {
  const { lista, recarga } = corpo.poderes;
  const pode = (i: number): boolean =>
    recarga[i] <= 0 &&
    distancia <= ALCANCE[lista[i]] &&
    corpo.energia >= custoDeEnergia(corpo, lista[i]) &&
    !(lista[i] === 'golem' && corpo.golem.recarga > 0);
  const ordem = [2, 1, 0].filter(pode);
  if (ordem[0] === 2 && ordem.length > 1 && Math.random() < SOSIA.guardarEspecial) ordem.shift();
  return ordem[0] ?? null;
}

// Mira onde você vai estar: o coração e o chicote no peito, adiantados pelo tempo até lá; as
// áreas no chão, adiantadas por parte do aviso (ele não adivinha tudo). Com um erro sorteado.
function mirar(corpo: Personagem, oponente: Personagem, poder: number): Mira {
  const erro = (): number => sortear([-SOSIA.erroMira, SOSIA.erroMira]);
  const id = corpo.poderes.lista[poder];
  if (id === 'rajada') {
    const voo = Math.abs(oponente.x - corpo.x) / RAJADA.velocidade;
    return { poder, x: oponente.x + oponente.vx * voo * 0.7 + erro(), y: oponente.y - 16 + erro() };
  }
  if (id === 'chicote') {
    const voo = (Math.abs(oponente.x - corpo.x) / CHICOTE.alcance) * CHICOTE.estica;
    return { poder, x: oponente.x + oponente.vx * voo * 0.7 + erro(), y: oponente.y - 16 + erro() / 2 };
  }
  if (id === 'aves') {
    const voo = Math.abs(oponente.x - corpo.x) / REVOADA.velocidade;
    return { poder, x: oponente.x + oponente.vx * voo * 0.7 + erro(), y: oponente.y - 16 + erro() / 2 };
  }
  if (id === 'pedra') {
    const voo = PEDRA.preparo + Math.abs(oponente.x - corpo.x) / PEDRA.velocidade;
    return { poder, x: oponente.x + oponente.vx * voo * 0.6 + erro(), y: oponente.y - 14 + erro() / 2 };
  }
  if (id === 'vento' || id === 'golem' || id === 'investida') return { poder, x: oponente.x, y: oponente.y - 16 };
  const aviso = AVISO[id] ?? 0.5;
  const x = oponente.x + oponente.vx * aviso * sortear([0.2, 0.9]) + erro();
  if (id === 'raizes') {
    // Mira a fileira para a última roda, a que prende mais, cair nele.
    const lado = oponente.x >= corpo.x ? 1 : -1;
    return { poder, x: x - lado * RAIZES.raio * 2 * (RAIZES.rodas - 1), y: oponente.y };
  }
  return { poder, x, y: oponente.y };
}

// Uma marca embaixo dele, já percebida: para onde correr (para fora dela, do lado mais perto),
// e se é baixa o bastante para pular por cima.
function fugaDeMarca(corpo: Personagem, ameacas: Ameacas): { x: number; pular: boolean } | null {
  for (const a of ameacas.areas) {
    const percebeu = a.resta < a.aviso * (1 - SOSIA.reacao);
    if (!percebeu || Math.abs(corpo.x - a.x) > a.raio + 8) continue;
    const lado = corpo.x >= a.x ? 1 : -1;
    const fora = noMapa(a.x + lado * (a.raio + 18));
    // Encostado na beirada do mapa, sai pelo outro lado.
    const x = Math.abs(fora - a.x) < a.raio ? noMapa(a.x - lado * (a.raio + 18)) : fora;
    return { x, pular: a.baixa && a.resta < 0.3 };
  }
  return null;
}

// Algo voando na direção dele (um coração, a ponta de um chicote), perto de chegar e na altura do corpo.
function coracaoChegando(corpo: Personagem, ameacas: Ameacas): boolean {
  return ameacas.projeteis.some((r) => {
    if (Math.abs(r.vx) < 1) return false;
    const t = (corpo.x - r.x) / r.vx;
    const y = r.y + r.vy * t;
    return t > 0 && t < 0.35 && y > corpo.y - 34 && y < corpo.y + 2;
  });
}

// A arma no chão mais perto que valha a viagem.
function armaParaBuscar(corpo: Personagem, armas: readonly { x: number }[]): number | null {
  let melhor: number | null = null;
  for (const a of armas) {
    const d = Math.abs(a.x - corpo.x);
    if (d <= SOSIA.buscarArma && (melhor === null || d < Math.abs(melhor - corpo.x))) melhor = a.x;
  }
  return melhor;
}

// Com a arma na mão: para onde andar (perto com a espada, longe com o arco) e, se ela está
// pronta e você no alcance, onde mirar.
function lutarComArma(c: CerebroSosia, corpo: Personagem, oponente: Personagem, dt: number): { x: number; golpe: { x: number; y: number } | null } {
  const arma = corpo.arma!;
  const dx = oponente.x - corpo.x;
  const distancia = Math.abs(dx);
  const lado = corpo.x >= oponente.x ? 1 : -1;
  const erro = (): number => sortear([-SOSIA.erroMira, SOSIA.erroMira]);
  const pronta = armaPronta(corpo) && oponente.vida > 0;
  if (!pronta) c.ateGolpe = sortear(SOSIA.entreGolpes);
  else c.ateGolpe -= dt;
  if (arma.tipo === 'espada') {
    const x = noMapa(oponente.x + lado * SOSIA.espada.perto);
    const alcanca = distancia <= SOSIA.espada.golpe && Math.abs(oponente.y - corpo.y) < 22;
    const golpe = pronta && c.ateGolpe <= 0 && alcanca ? { x: oponente.x, y: oponente.y - 16 } : null;
    return { x, golpe };
  }
  const x = noMapa(oponente.x + lado * SOSIA.arco.longe);
  if (!pronta || c.ateGolpe > 0 || distancia < SOSIA.arco.de || distancia > SOSIA.arco.ate) return { x, golpe: null };
  // Mira acima do peito o tanto que a flecha cai no caminho, e adiantado pelo passo dele.
  const voo = distancia / ARCO.velocidade;
  const queda = 0.5 * ARCO.gravidade * voo * voo;
  return { x, golpe: { x: oponente.x + oponente.vx * voo * 0.7 + erro(), y: oponente.y - 16 - queda + erro() } };
}

export function pensarSosia(
  c: CerebroSosia,
  corpo: Personagem,
  dt: number,
  oponente: Personagem,
  ameacas: Ameacas,
  armas: readonly { x: number }[] = [],
): DecisaoSosia {
  const controles: Controles = { esquerda: false, direita: false, pular: false, transformar: false };
  // O Vendaval sopra até o tempo sorteado acabar.
  c.soprar -= dt;
  const decisao: DecisaoSosia = { controles, mira: null, golpe: null, soltar: c.soprar <= 0 };
  // Transformando, o corpo não responde: espera a luz passar.
  if (!personagemLivre(corpo)) return decisao;
  const forma = formaDo(corpo);

  // Mudou de forma (pelo R dele ou porque o minuto de anjo acabou): sorteia quanto fica nesta.
  if (forma !== c.forma) {
    c.forma = forma;
    c.ateTrocar = sortear(SOSIA.forma[forma]);
  }
  // A casa acompanha você, do lado em que ele está.
  const lado = corpo.x >= oponente.x ? 1 : -1;
  const longe = corpo.heroi !== 'anjo' && forma === 'base' && corpo.modo === 'poderes' ? SOSIA.distanciaPoderes : SOSIA.distancia[forma];
  c.casa = noMapa(oponente.x + lado * longe);

  const guardando = corpo.arma !== null && corpo.arma.durabilidade > SOSIA.guardarArma;
  const podeApertar = corpo.noChao && c.segurando <= 0 && !corpo.transformarSegurado;
  if (corpo.heroi !== 'anjo') {
    // Com uma arma boa (ou sem energia nem para o primeiro poder), o modo arma; senão, os
    // poderes. Muda o modo por um quadro só (não há tecla para isso). De golem não muda.
    const semEnergia = corpo.energia < custoDeEnergia(corpo, corpo.poderes.lista[0]);
    // O Grow com a barra cheia quer os poderes: o terceiro vira golem.
    const cheia = podeVirarGolem(corpo);
    const quer: Modo = (guardando || semEnergia) && !cheia ? 'arma' : 'poderes';
    if (forma === 'base' && corpo.modo !== quer && podeApertar && !corpo.canalizando) {
      corpo.modo = quer;
      return decisao;
    }
  } else {
    // Troca de forma só com os pés no chão, sem pulo em curso e, para virar anjo, com a energia e
    // a recarga prontas. Aperta R por um quadro só: no seguinte o corpo já está transformando e o
    // cérebro espera (e, se o aperto não pegou, solta o botão antes de apertar de novo).
    if (forma === 'anjo' || podeVirarAnjo(corpo)) c.ateTrocar -= dt;
    if (c.ateTrocar <= 0 && !guardando && podeApertar) {
      controles.transformar = true;
      return decisao;
    }
  }

  const fuga = fugaDeMarca(corpo, ameacas);
  const buscar = podePegarArma(corpo) ? armaParaBuscar(corpo, armas) : null;
  const luta = corpo.arma && formaDo(corpo) === 'base' && !usaPoderes(corpo) ? lutarComArma(c, corpo, oponente, dt) : null;
  decisao.golpe = luta?.golpe ?? null;
  // Sem arma e sem os poderes na mão, de perto: um soco de vez em quando.
  if (!corpo.arma && formaDo(corpo) === 'base' && !usaPoderes(corpo) && armaPronta(corpo) && oponente.vida > 0) {
    const perto = Math.abs(oponente.x - corpo.x) <= SOSIA.soco && Math.abs(oponente.y - corpo.y) < 20;
    if (perto && Math.random() < dt * SOSIA.socosPorSegundo) decisao.golpe = { x: oponente.x, y: oponente.y - 16 };
  }
  if (fuga) {
    c.alvo = fuga.x;
  } else if (buscar !== null) {
    c.alvo = buscar;
  } else if (luta) {
    // Com a arma, não passeia: vai direto para a distância dela.
    c.alvo = Math.abs(luta.x - corpo.x) >= 4 ? luta.x : null;
  } else if (c.alvo === null) {
    c.espera -= dt;
    if (c.espera <= 0) c.alvo = escolherDestino(c, corpo.x);
  } else if (Math.abs(c.alvo - corpo.x) < 2) {
    c.alvo = null;
    c.espera = sortear(SOSIA.parado);
  }
  if (c.alvo !== null && Math.abs(c.alvo - corpo.x) >= 2) {
    controles.direita = c.alvo > corpo.x;
    controles.esquerda = !controles.direita;
  }

  // Pular um coração que vem: decide uma vez e espera antes de decidir de novo.
  c.ateDesviar -= dt;
  let desviar = Boolean(fuga?.pular);
  if (!desviar && c.ateDesviar <= 0 && coracaoChegando(corpo, ameacas)) {
    c.ateDesviar = 0.4;
    desviar = Math.random() < SOSIA.desvioPulo;
  }

  // O botão fica solto pelo menos um quadro entre dois pulos: o corpo só pula ao apertar de novo.
  if (c.segurando > 0) {
    c.segurando -= dt;
    controles.pular = true;
  } else if (corpo.noChao && !corpo.pularSegurado) {
    c.ateOPulo -= dt;
    if (desviar || c.ateOPulo <= 0) {
      c.segurando = desviar ? sortear([0.15, 0.35]) : sortear(SOSIA.segurar[forma]);
      c.ateOPulo = sortear(SOSIA.pulo[forma]);
      controles.pular = true;
    }
  }

  // Com os poderes na mão (o Anjo de anjo, a Leslie no modo poderes), ataca quando você está no
  // alcance.
  c.ateAtacar -= dt;
  const comPoderes = usaPoderes(corpo) && personagemLivre(corpo) && !corpo.encanto && corpo.vida > 0;
  if (c.ateAtacar <= 0 && comPoderes && oponente.vida > 0) {
    c.ateAtacar = sortear(SOSIA.entreAtaques);
    const poder = escolherPoder(corpo, Math.abs(oponente.x - corpo.x));
    if (poder !== null && !corpo.canalizando) {
      decisao.mira = mirar(corpo, oponente, poder);
      if (corpo.poderes.lista[poder] === 'vento') {
        c.soprar = sortear(SOSIA.soprar);
        decisao.soltar = false;
      }
    }
  }
  return decisao;
}
