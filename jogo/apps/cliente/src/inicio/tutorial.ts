// O tutorial, dentro da partida de treino (partida.ts, `treino`): um cartão no alto da tela diz o
// que fazer — andar, pular, arranco, pegar a arma, atacar, a energia, trocar para os poderes,
// cada poder do seu personagem e a ult — e a etapa passa sozinha quando a pessoa faz (o tutorial
// olha o estado da partida a cada quadro). Um contorno piscando aponta a parte do painel de que a
// etapa fala. "Já sei jogar" (embaixo, à direita) sai a qualquer hora; no fim, "Ir para o jogo"
// sai e "Continuar treinando" fica no treino, sem o cartão.
//
// O treino ajuda nas etapas dos poderes: começa cada uma com o poder carregado e energia
// suficiente (na da ult, a barra cheia), para ninguém ficar esperando.

import { DADOS_ARMA, ENERGIA_PIXY, MUNDO, NOME_PODER, PODERES_DO_HEROI, PODERES_GOLEM, type Heroi, type IdPoder } from '@terna/compartilhado';
import { soltarNoMapa } from '../entidades/armas';
import { custoDeEnergia, formaDo, type Personagem } from '../entidades/personagem';
import { areaNoSeuPainel, type ParteDoPainel } from '../interface/painel';
import type { Partida } from '../partida';
import { SOBRE_PODER } from './ajuda';
import { botao, elemento } from './dom';

export interface Tutorial {
  // Um quadro: confere a etapa (parado com o menu aberto).
  atualizar(p: Partida): void;
  // Saiu da partida: tira tudo da tela.
  remover(): void;
}

export interface OpcoesTutorial {
  heroi: Heroi;
  // A primeira vez (logo depois de criar a conta): o botão de sair é "Já sei jogar".
  primeiraVez: boolean;
  // Sair do treino (pulou, ou terminou e foi para o jogo).
  aoSair: () => void;
}

// O que cada etapa lembra enquanto está aberta.
interface Memoria {
  andou: number;
  ultimoX: number;
  vezes: number;
  vidaDoBoneco: number;
  puloDuplo: boolean;
  noDash: boolean;
  recargas: number[];
  semArma: number; // segundos sem arma na mão nem no chão (a da etapa de pegar sumiu)
}

interface Etapa {
  titulo: string;
  // O texto, com as teclas entre colchetes: "[A]" vira uma tecla desenhada.
  texto: string;
  destaque?: ParteDoPainel;
  semArma?: boolean; // o destaque na fileira sem o quadrinho da arma (o golem)
  meta?: number; // quantas vezes (mostra "1/3")
  continuo?: boolean; // o progresso anda aos poucos (a barra mostra quanto falta), sem contar vezes
  continuar?: string; // etapa só de ler: o botão que passa
  comecar?(p: Partida, m: Memoria): void;
  // Quanto já fez: de 0 a 1 (ou até `meta`, contando vezes). Chegou lá, a etapa passa.
  progresso?(p: Partida, m: Memoria, dt: number): number;
  // Uma dica que depende do momento (a moldura no poder errado, por exemplo).
  dica?(p: Partida): string | null;
}

const COMEMORAR_S = 0.9; // segundos do "Boa!" antes da próxima etapa
const ANDAR_PX = 120;

const primeiraMaiuscula = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// A recarga de um poder subiu desde o último quadro: ele acabou de sair.
function saiu(j: Personagem, m: Memoria, i: number): boolean {
  const agora = j.poderes.recarga[i] ?? 0;
  const antes = m.recargas[i] ?? 0;
  return agora > antes + 0.01;
}

function lembrarRecargas(j: Personagem, m: Memoria): void {
  m.recargas = [...j.poderes.recarga];
}

// Carrega o poder `i` e dá a energia que ele pede (o treino não faz esperar).
function prepararPoder(j: Personagem, i: number, barraCheia = false): void {
  j.poderes.recarga[i] = 0;
  const custo = custoDeEnergia(j, j.poderes.lista[i]);
  j.energia = barraCheia ? ENERGIA_PIXY.maxima : Math.min(ENERGIA_PIXY.maxima, Math.max(j.energia, custo + 20));
  if (j.poderes.lista[i] === 'golem') j.golem.recarga = 0;
}

function soltarEspada(p: Partida): void {
  const j = p.jogador;
  // Na frente dele, sem cair fora do mapa nem em cima do boneco.
  let x = j.x + 70 * j.direcao;
  if (x < 40 || x > MUNDO - 40) x = j.x - 70 * j.direcao;
  if (Math.abs(x - p.outro.x) < 24) x = j.x - 70 * j.direcao;
  soltarNoMapa(p.arsenal, { id: p.arsenal.proximoId++, tipo: 'espada', x, durabilidade: DADOS_ARMA.espada.durabilidade });
}

// "Use o [Clique dir.] até a moldura verde ficar no 2."
function dicaDoPoder(i: number) {
  return (p: Partida): string | null => {
    const j = p.jogador;
    if (j.modo === 'poderes' && j.poderes.selecionado === i) return null;
    return `Use o [Clique dir.] até a moldura verde ficar no ${i + 1}.`;
  };
}

function etapaDoPoder(poder: IdPoder, i: number, extra = ''): Etapa {
  return {
    titulo: `Poder ${i + 1}: ${NOME_PODER[poder]}`,
    texto: `${primeiraMaiuscula(SOBRE_PODER[poder])}. ${extra || 'Com a moldura verde nele, clique com o [Clique esq.] mirando no boneco.'}`,
    destaque: `poder${i + 1}` as ParteDoPainel,
    comecar: (p, m) => {
      prepararPoder(p.jogador, i);
      lembrarRecargas(p.jogador, m);
    },
    progresso: (p, m) => {
      const foi = saiu(p.jogador, m, i);
      lembrarRecargas(p.jogador, m);
      return foi ? 1 : 0;
    },
    dica: dicaDoPoder(i),
  };
}

function etapasDo(heroi: Heroi): Etapa[] {
  const [p1, p2, p3] = PODERES_DO_HEROI[heroi];
  const etapas: Etapa[] = [
    {
      titulo: 'Andar',
      texto: 'Use [A] e [D] (ou as setas [←] [→]) para andar pela floresta.',
      continuo: true,
      progresso: (p, m) => {
        m.andou += Math.abs(p.jogador.x - m.ultimoX);
        m.ultimoX = p.jogador.x;
        return m.andou / ANDAR_PX;
      },
    },
    {
      titulo: 'Pular',
      texto: '[W], [↑] ou [Espaço] pula. Lá no alto, aperte de novo para dar o pulo duplo.',
      progresso: (p, m) => {
        const j = p.jogador;
        // O pulo duplo gasta a segunda chance com o corpo ainda no ar.
        const deu = m.puloDuplo && !j.puloDuplo && !j.noChao;
        m.puloDuplo = j.puloDuplo;
        return deu ? 1 : 0;
      },
    },
    {
      titulo: 'Arranco',
      texto: 'Toque duas vezes rápido em [A] ou [D] para dar um arranco, no chão ou no ar.',
      meta: 2,
      progresso: (p, m) => {
        const noDash = p.jogador.dash > 0;
        if (noDash && !m.noDash) m.vezes++;
        m.noDash = noDash;
        return m.vezes;
      },
    },
    {
      titulo: 'Pegar a arma',
      texto: 'Uma espada caiu do céu! Encoste nela para pegar. As armas duram um tempo na mão e quebram.',
      destaque: 'arma',
      comecar: (p) => {
        if (!p.jogador.arma) soltarEspada(p);
      },
      progresso: (p, m, dt) => {
        if (p.jogador.arma) return 1;
        // A espada sumiu antes de ele chegar: cai outra.
        m.semArma = p.arsenal.chao.length ? 0 : m.semArma + dt;
        if (m.semArma > 1.5) {
          m.semArma = 0;
          soltarEspada(p);
        }
        return 0;
      },
    },
    {
      titulo: 'Atacar',
      texto: 'Mire com o mouse e clique com o [Clique esq.] para acertar o boneco. Sem arma, o clique dá um soco.',
      meta: 3,
      comecar: (p, m) => {
        m.vidaDoBoneco = p.outro.vida;
      },
      progresso: (p, m) => {
        if (p.outro.vida < m.vidaDoBoneco - 0.5) m.vezes++;
        m.vidaDoBoneco = p.outro.vida;
        return m.vezes;
      },
      dica: (p) => (p.jogador.modo === 'poderes' ? 'Use o [Clique dir.] até a moldura verde voltar para a arma.' : null),
    },
    {
      titulo: 'Energia pixy',
      texto:
        'Cada golpe que acerta enche a energia pixy, a barra de baixo do seu painel. Os poderes gastam dela, e o 3 (a ult) só sai com a barra cheia.',
      destaque: 'energia',
      continuar: 'Entendi',
      comecar: (p) => {
        p.jogador.energia = Math.max(p.jogador.energia, 30);
      },
    },
    {
      titulo: 'Trocar para os poderes',
      texto:
        'O [Clique dir.] passa da arma para os poderes, um por um. A moldura verde mostra o que o [Clique esq.] vai usar; poder que ainda não carregou fica de fora.',
      destaque: 'poderes',
      comecar: (p) => {
        prepararPoder(p.jogador, 0);
        prepararPoder(p.jogador, 1);
      },
      progresso: (p) => (p.jogador.modo === 'poderes' ? 1 : 0),
    },
    etapaDoPoder(p1, 0),
    etapaDoPoder(
      p2,
      1,
      heroi === 'grow' ? 'Com a moldura verde nele, segure o [Clique esq.] para soprar; soltando, o vento para.' : '',
    ),
    {
      titulo: `A ult: ${NOME_PODER[p3]}`,
      texto: `${primeiraMaiuscula(SOBRE_PODER[p3])}. No treino, a gente encheu a sua barra: ponha a moldura verde no 3 e use!`,
      destaque: 'poder3',
      comecar: (p, m) => {
        prepararPoder(p.jogador, 2, true);
        lembrarRecargas(p.jogador, m);
      },
      progresso: (p, m) => {
        const j = p.jogador;
        const foi = heroi === 'grow' ? formaDo(j) === 'golem' : saiu(j, m, 2);
        // Ainda não saiu e a energia caiu (o 1 e o 2 gastam um pouco): enche de novo. Depois de
        // conferir — a ult gasta a barra toda ao sair.
        if (!foi && j.energia < ENERGIA_PIXY.maxima && formaDo(j) === 'base') prepararPoder(j, 2, true);
        lembrarRecargas(j, m);
        return foi ? 1 : 0;
      },
      dica: dicaDoPoder(2),
    },
  ];

  if (heroi === 'grow') {
    const nomes = PODERES_GOLEM.map((id) => NOME_PODER[id]);
    etapas.push(
      {
        titulo: 'De golem',
        texto: `Agora os seus poderes são ${nomes[0]}, ${nomes[1]} e ${nomes[2]}: batem forte e não gastam energia. A pele de pedra segura parte do dano. Use um no boneco!`,
        destaque: 'poderes',
        semArma: true,
        comecar: (p, m) => lembrarRecargas(p.jogador, m),
        progresso: (p, m) => {
          const j = p.jogador;
          // O golem acabou antes (30 s): passa do mesmo jeito.
          if (formaDo(j) !== 'golem') return 1;
          const foi = PODERES_GOLEM.some((_, i) => saiu(j, m, i));
          lembrarRecargas(j, m);
          return foi ? 1 : 0;
        },
      },
      {
        titulo: 'Voltar a ser gente',
        texto: 'O golem dura um tempo e volta sozinho. Para desfazer antes, aperte [R].',
        progresso: (p) => (formaDo(p.jogador) === 'golem' ? 0 : 1),
      },
    );
  }

  etapas.push(
    {
      titulo: 'De volta à arma',
      texto: 'Use o [Clique dir.] até a moldura verde voltar para a arma (ou o soco). A tecla [E] joga fora a arma da mão.',
      destaque: 'arma',
      progresso: (p) => (p.jogador.modo === 'arma' && formaDo(p.jogador) === 'base' ? 1 : 0),
    },
    {
      titulo: 'Pronto para a floresta!',
      texto: 'Você aprendeu o básico. Na partida, [Esc] abre o menu e [Tab] mostra todos os controles e os poderes do seu personagem.',
    },
  );
  return etapas;
}

// O texto com as teclas desenhadas no lugar de "[...]".
function textoComTeclas(texto: string): Node[] {
  return texto.split(/(\[[^\]]+\])/).map((parte) => {
    const tecla = parte.match(/^\[([^\]]+)\]$/);
    return tecla ? elemento('kbd', 'tut-tecla', tecla[1]) : document.createTextNode(parte);
  });
}

export function iniciarTutorial({ heroi, primeiraVez, aoSair }: OpcoesTutorial): Tutorial {
  const hud = document.getElementById('hud');
  if (!hud) throw new Error('faltou o <div id="hud"> na página');

  const etapas = etapasDo(heroi);
  const cartao = elemento('section', 'tut-cartao');
  cartao.setAttribute('aria-live', 'polite');
  const topo = elemento('p', 'tut-topo');
  const titulo = elemento('h2', 'tut-titulo');
  const texto = elemento('p', 'tut-texto');
  const dica = elemento('p', 'tut-dica');
  const barra = elemento('div', 'tut-barra');
  const cheia = elemento('div', 'tut-barra-cheia');
  barra.append(cheia);
  const conta = elemento('span', 'tut-conta');
  const acoes = elemento('div', 'tut-acoes');
  cartao.append(topo, titulo, texto, dica, barra, acoes);

  const destaque = elemento('div', 'tut-destaque');
  destaque.setAttribute('aria-hidden', 'true');
  const sair = botao(primeiraVez ? 'Já sei jogar' : 'Sair do treino', 'inicio-botao inicio-botao-claro tut-sair', () => aoSair());
  hud.append(destaque, cartao, sair);

  let indice = -1;
  let precisaComecar = false;
  let comemorando = 0; // segundos do "Boa!" que ainda faltam
  let ultimoQuadro = performance.now();
  let memoria: Memoria;
  let dicaAtual: string | null = null;
  let progressoMostrado = -1;

  const apontar = (etapa: Etapa): void => {
    if (!etapa.destaque) {
      destaque.hidden = true;
      return;
    }
    const a = areaNoSeuPainel(etapa.destaque, !etapa.semArma);
    // Nas barras (vida, energia) a setinha de baixo cairia em cima dos quadrinhos: só o contorno.
    destaque.classList.toggle('tut-destaque-barra', etapa.destaque === 'vida' || etapa.destaque === 'energia');
    // Em porcentagem da tela do jogo (480 × 270): acompanha o tamanho da janela.
    Object.assign(destaque.style, {
      left: `${(a.x / 480) * 100}%`,
      top: `${(a.y / 270) * 100}%`,
      width: `${(a.w / 480) * 100}%`,
      height: `${(a.h / 270) * 100}%`,
    });
    destaque.hidden = false;
  };

  const mostrarProgresso = (etapa: Etapa, valor: number): void => {
    const fracao = Math.max(0, Math.min(1, etapa.meta ? valor / etapa.meta : valor));
    if (fracao === progressoMostrado) return;
    progressoMostrado = fracao;
    cheia.style.width = `${(fracao * 100).toFixed(1)}%`;
    if (etapa.meta) conta.textContent = `${Math.min(etapa.meta, Math.floor(valor))}/${etapa.meta}`;
  };

  const terminarTutorial = (): void => {
    destaque.hidden = true;
    const ir = botao('Ir para o jogo', 'inicio-botao tut-botao', () => aoSair());
    const ficar = botao('Continuar treinando', 'inicio-botao inicio-botao-claro tut-botao', () => {
      // Fica no treino só com o botão de sair.
      cartao.hidden = true;
      sair.textContent = 'Sair do treino';
      sair.hidden = false;
    });
    acoes.replaceChildren(ir, ficar);
    sair.hidden = true;
  };

  const abrirEtapa = (i: number): void => {
    indice = i;
    const etapa = etapas[i];
    precisaComecar = true;
    cartao.classList.remove('tut-feito');
    topo.textContent = '';
    topo.append(elemento('span', '', 'Tutorial'), elemento('span', '', `${i + 1} de ${etapas.length}`));
    titulo.textContent = etapa.titulo;
    texto.replaceChildren(...textoComTeclas(etapa.texto));
    dica.replaceChildren();
    dicaAtual = null;
    progressoMostrado = -1;
    // A barra só onde há o que medir: andar e as etapas que contam vezes (as outras são de uma vez).
    barra.hidden = !(etapa.meta || etapa.continuo);
    conta.textContent = '';
    acoes.replaceChildren();
    if (etapa.meta) acoes.append(conta);
    if (etapa.continuar) {
      const b = botao(etapa.continuar, 'inicio-botao tut-botao', () => concluir());
      acoes.append(b);
    }
    apontar(etapa);
    if (i === etapas.length - 1) terminarTutorial();
  };

  // A etapa nova começa no quadro seguinte, com a partida em mãos (ela lembra de onde partiu).
  const comecarSePreciso = (p: Partida): void => {
    if (!precisaComecar) return;
    precisaComecar = false;
    const etapa = etapas[indice];
    const jgd = p.jogador;
    memoria = {
      andou: 0,
      ultimoX: jgd.x,
      vezes: 0,
      vidaDoBoneco: p.outro.vida,
      puloDuplo: jgd.puloDuplo,
      noDash: jgd.dash > 0,
      recargas: [...jgd.poderes.recarga],
      semArma: 0,
    };
    etapa.comecar?.(p, memoria);
  };

  // A etapa foi feita: "Boa!" por um instante e a próxima.
  const concluir = (): void => {
    if (comemorando > 0 || indice >= etapas.length - 1) return;
    comemorando = COMEMORAR_S;
    cartao.classList.add('tut-feito');
    destaque.hidden = true;
    titulo.textContent = 'Boa!';
    dica.replaceChildren();
    cheia.style.width = '100%';
    acoes.replaceChildren();
  };

  abrirEtapa(0);

  return {
    atualizar(p) {
      const agora = performance.now();
      const dt = Math.min(0.1, (agora - ultimoQuadro) / 1000);
      ultimoQuadro = agora;
      if (p.menuAberto || p.acabou) return;
      if (comemorando > 0) {
        comemorando -= dt;
        if (comemorando > 0) return;
        comemorando = 0;
        abrirEtapa(indice + 1);
      }
      comecarSePreciso(p);
      const etapa = etapas[indice];
      const novaDica = etapa.dica?.(p) ?? null;
      if (novaDica !== dicaAtual) {
        dicaAtual = novaDica;
        dica.replaceChildren(...(novaDica ? textoComTeclas(novaDica) : []));
      }
      if (!etapa.progresso || etapa.continuar) return;
      const valor = etapa.progresso(p, memoria, dt);
      mostrarProgresso(etapa, valor);
      if ((etapa.meta ? valor / etapa.meta : valor) >= 1) concluir();
    },
    remover() {
      cartao.remove();
      destaque.remove();
      sair.remove();
    },
  };
}
