// Ponto de entrada do jogo: carrega as folhas de sprite, monta o mundo e roda o laço
// principal (atualizar → desenhar) a cada quadro do navegador. Por cima, o ciclo das telas:
// carregamento → tela inicial → partida → fim → tela inicial de novo.

import { MUNDO } from '@terna/compartilhado';
import { atualizarAnimais, desenharAnimais, desenharAnimaisNoAr, prepararAnimais } from './entidades/animais';
import { desenharArmasNaFrente, desenharArmasNoChao, desenharPreviaDoArco, prepararArmas } from './entidades/armas';
import {
  acimaDaCabeca,
  armaPronta,
  carregarAnimacoesPersonagem,
  desenharPersonagem,
  desenharSombraDoPersonagem,
  formaDo,
  peitoDo,
  podeUsarPoderes,
  prepararPersonagens,
  type Controles,
} from './entidades/personagem';
import {
  desenharBordaDoEncanto,
  desenharEfeitosNaFrente,
  desenharEfeitosNoChao,
  desenharNumerosDeDano,
  desenharPreviaDoPoder,
  poderEscolhido,
  prepararPoderes,
} from './entidades/poderes';
import { carregar, escolherModo, type Escolha } from './inicio/inicio';
import { montarMenus } from './inicio/na-partida';
import { desenharCronometro } from './interface/cronometro';
import { desenharEtiquetas } from './interface/etiqueta';
import { aplicarMira } from './interface/mira';
import { desenharPainel } from './interface/painel';
import { contexto2d } from './motor/imagens';
import { suavizar } from './motor/matematica';
import type { Luz, Vista } from './motor/tipos';
import {
  atualizarPassaros,
  carregarFolhaCenario,
  desenharFundo,
  desenharLuz,
  desenharVegetacao,
  luzDoSol,
} from './mundo/cenario';
import { TILE, criarChao } from './mundo/chao';
import { atualizarMinhocas, desenharMinhocas, prepararMinhocas } from './mundo/minhocas';
import {
  atualizarPartida,
  criarPartida,
  encerrarPartida,
  type AcoesMouse,
  type FimDaPartida,
  type Partida,
} from './partida';

const canvas = document.getElementById('jogo');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('faltou o <canvas id="jogo"> na página');
const ctx = contexto2d(canvas);
ctx.imageSmoothingEnabled = false;

const LARGURA = canvas.width;
const ALTURA = canvas.height;
const ALTURA_CHAO = 3 * TILE;
const Y_CHAO = ALTURA - ALTURA_CHAO;

const FOLGA_TUFOS = 4;
const chao = criarChao(MUNDO, ALTURA_CHAO, FOLGA_TUFOS);

const SEGUIR_CAMERA = 5; // quanto maior, mais rápido a câmera alcança o personagem

let folhaCenario: HTMLImageElement;
// A partida em andamento. Sem ela (nas telas de menu), só o cenário roda ao fundo: sem
// personagens, nomes, painéis nem cronômetro.
let partida: Partida | null = null;

// ---- Câmera e tela dividida ----
// Cada metade da tela é uma janela sobre uma tela inteira com câmera própria: a da esquerda
// mostra a parte de 0 a METADE da vista da câmera `esquerda`; a da direita, a parte de METADE
// a LARGURA da vista da câmera `direita`. Com as duas câmeras no mesmo lugar as metades se
// encaixam e a tela é uma só. Enquanto os dois cabem juntos na tela, as duas câmeras seguem o
// ponto do meio entre eles. Passando disso, a tela se divide — quem está mais à esquerda fica
// na metade da esquerda — e, ao longo de SEPARANDO pixels de afastamento, cada câmera vai
// centralizar o seu personagem na sua metade. A divisão nasce sem tranco (no começo as metades
// mostram a mesma imagem de antes) e some do mesmo jeito quando eles se reaproximam.
// Céu, sol e luz são da tela, não do mapa: ficam no mesmo lugar nas duas metades.
const METADE = LARGURA / 2;
const MARGEM_JUNTOS = 40; // pixels da borda: mais perto disso, um sairia da vista do outro
const JUNTOS = LARGURA - 2 * MARGEM_JUNTOS; // maior distância entre os dois com a tela inteira
const SEPARANDO = 120; // pixels de afastamento para cada metade centralizar o seu personagem
const DIVISAO_APARECE = 12; // pixels de diferença entre as câmeras até a linha ficar inteira

// `esquerda` e `direita`: borda esquerda da tela inteira de cada câmera, no mapa (0 a MUNDO - LARGURA).
// `dividida` só liga com as câmeras a 1 px uma da outra e só desliga abaixo de meio pixel: com
// menos que isso, o arredondamento fazia a tela piscar entre inteira e dividida.
const CAMERA_NO_MEIO = (MUNDO - LARGURA) / 2;
const camera = { esquerda: CAMERA_NO_MEIO, direita: CAMERA_NO_MEIO, dividida: false };

const limitarCamera = (x: number): number => Math.max(0, Math.min(MUNDO - LARGURA, x));

function atualizarCamera(p: Partida, dt: number): void {
  const [a, b] = p.jogador.x <= p.outro.x ? [p.jogador.x, p.outro.x] : [p.outro.x, p.jogador.x];
  const juntos = (a + b) / 2 - METADE;
  const separar = suavizar(JUNTOS, JUNTOS + SEPARANDO, b - a);
  // Separados: `a` no meio da metade da esquerda (x = METADE / 2), `b` no meio da da direita.
  const alvoEsquerda = limitarCamera(juntos + (a - METADE / 2 - juntos) * separar);
  const alvoDireita = limitarCamera(juntos + (b - (METADE + METADE / 2) - juntos) * separar);
  // As câmeras perseguem o alvo com suavidade e param nas bordas do mapa: ali quem anda até a
  // beirada é o personagem.
  const k = Math.min(1, dt * SEGUIR_CAMERA);
  camera.esquerda += (alvoEsquerda - camera.esquerda) * k;
  camera.direita += (alvoDireita - camera.direita) * k;
  const diferenca = Math.abs(camera.direita - camera.esquerda);
  camera.dividida = diferenca >= (camera.dividida ? 0.5 : 1);
}

// Onde cada câmera está, em pixels inteiros. Sem divisão, a tela inteira usa a da esquerda.
function camerasNaTela(): { esquerda: number; direita: number; dividida: boolean } {
  const esquerda = Math.round(camera.esquerda);
  const direita = camera.dividida ? Math.round(camera.direita) : esquerda;
  return { esquerda, direita, dividida: camera.dividida };
}

// Os trechos do mapa que aparecem: um com a tela inteira, dois com ela dividida.
function vistas(): Vista[] {
  const { esquerda, direita, dividida } = camerasNaTela();
  if (!dividida) return [{ x: esquerda, largura: LARGURA }];
  return [
    { x: esquerda, largura: METADE },
    { x: direita + METADE, largura: METADE },
  ];
}

const teclas: Record<string, boolean> = {};
window.addEventListener('keydown', (evento) => {
  teclas[evento.code] = true;
  // E joga fora a arma da mão: uma vez por toque (segurar não repete).
  if (evento.code === 'KeyE' && !evento.repeat && partida) mouse.descartar = true;
});
window.addEventListener('keyup', (evento) => {
  teclas[evento.code] = false;
});
// Trocando de aba com uma tecla apertada, o keyup não chega: solta tudo.
window.addEventListener('blur', soltarTeclas);

function soltarTeclas(): void {
  for (const tecla of Object.keys(teclas)) teclas[tecla] = false;
}

function lerTeclado(): Controles {
  return {
    esquerda: Boolean(teclas['ArrowLeft'] || teclas['KeyA']),
    direita: Boolean(teclas['ArrowRight'] || teclas['KeyD']),
    pular: Boolean(teclas['Space'] || teclas['ArrowUp'] || teclas['KeyW']),
    transformar: Boolean(teclas['KeyR']), // R alterna entre a forma base e a de anjo
  };
}

// ---- Mouse ----
// Na partida, o botão direito passa para o próximo poder e o esquerdo usa o escolhido (na forma
// base, ataca com a arma da mão), mirando no ponto do mapa embaixo do cursor. Com a tela dividida, cada metade tem a sua câmera: o
// ponto sai da câmera da metade clicada. O menu do botão direito do navegador não abre no jogo.
// Em cima do jogo, no lugar da seta do sistema, o cursor vira a mira (interface/mira.ts). A
// posição guardada aqui serve às prévias do poder e do arco.
const mouse: AcoesMouse = { trocar: 0, usar: null, descartar: false };
const cursor = { x: 0, y: 0, dentro: false }; // em pixels da tela do jogo

function pontoNaTela(evento: PointerEvent): { x: number; y: number } {
  const caixa = ctx.canvas.getBoundingClientRect();
  return {
    x: ((evento.clientX - caixa.left) / caixa.width) * LARGURA,
    y: ((evento.clientY - caixa.top) / caixa.height) * ALTURA,
  };
}

function telaParaMapa({ x, y }: { x: number; y: number }): { x: number; y: number } {
  const { esquerda, direita, dividida } = camerasNaTela();
  return { x: (dividida && x >= METADE ? direita : esquerda) + x, y };
}

canvas.addEventListener('contextmenu', (evento) => evento.preventDefault());
canvas.addEventListener('pointerdown', (evento) => {
  if (!partida || evento.pointerType === 'touch') return;
  if (evento.button === 2) mouse.trocar++;
  else if (evento.button === 0) mouse.usar = telaParaMapa(pontoNaTela(evento));
});
canvas.addEventListener('pointermove', (evento) => {
  if (evento.pointerType === 'touch') return;
  Object.assign(cursor, pontoNaTela(evento), { dentro: true });
});
canvas.addEventListener('pointerleave', () => {
  cursor.dentro = false;
});

// A mira aparece na partida, com o cursor em cima do jogo e fora do menu.
const mostrarMira = (p: Partida): boolean => cursor.dentro && !p.menuAberto && !p.acabou;

// O clique sai agora? De anjo, o poder escolhido; na forma base, a arma da mão. (Pinta a mira de
// verde e mostra a prévia.)
function acaoPronta(p: Partida): boolean {
  if (formaDo(p.jogador) === 'base') return armaPronta(p.jogador);
  const { poderes } = p.jogador;
  return podeUsarPoderes(p.jogador) && poderes.recarga[poderes.selecionado] <= 0;
}

// O que o mouse (e a tecla E) fez desde o último quadro, uma vez só.
function lerMouse(): AcoesMouse {
  const acoes = { ...mouse };
  mouse.trocar = 0;
  mouse.usar = null;
  mouse.descartar = false;
  return acoes;
}

function atualizar(dt: number, tempo: number): void {
  const acoes = lerMouse();
  if (partida) {
    atualizarPartida(partida, lerTeclado(), acoes, dt, tempo);
    atualizarCamera(partida, dt);
  }
  const { esquerda, direita } = camerasNaTela();
  atualizarPassaros(dt, LARGURA, esquerda, direita);
  atualizarAnimais(dt, partida ? [partida.jogador, partida.outro] : [], vistas());
  atualizarMinhocas(dt);
}

// Uma tela inteira vista pela câmera `camX`, recortada na faixa de `x0` a `x0 + largura` da
// tela. O fundo é desenhado em coordenadas de tela, com paralaxe; chão, plantas da frente e os
// personagens em coordenadas do mapa, deslocados pela câmera.
function desenharVista(tempo: number, luz: Luz, camX: number, x0: number, largura: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, largura, ALTURA);
  ctx.clip();
  desenharFundo(ctx, folhaCenario, tempo, luz, camX, LARGURA, ALTURA, Y_CHAO);

  ctx.translate(-camX, 0);
  ctx.drawImage(chao, 0, Y_CHAO - FOLGA_TUFOS);
  desenharMinhocas(ctx, camX, LARGURA);
  desenharVegetacao(ctx, folhaCenario, tempo, luz, Y_CHAO, camX, LARGURA);
  desenharAnimais(ctx, luz, tempo, camX, LARGURA);

  if (partida) {
    // As marcas dos poderes no chão, embaixo de todos; o outro atrás e você na frente, quando um
    // passa pelo outro; os poderes voando e explodindo por cima dos dois.
    desenharEfeitosNoChao(ctx, partida.efeitos, tempo);
    desenharArmasNoChao(ctx, partida.arsenal, tempo);
    desenharSombraDoPersonagem(ctx, partida.outro, luz);
    desenharSombraDoPersonagem(ctx, partida.jogador, luz);
    desenharPersonagem(ctx, partida.outro, tempo);
    desenharPersonagem(ctx, partida.jogador, tempo);
    desenharEfeitosNaFrente(ctx, partida.efeitos, tempo);
    desenharArmasNaFrente(ctx, partida.arsenal);
    if (mostrarMira(partida) && acaoPronta(partida)) {
      const { jogador } = partida;
      if (formaDo(jogador) === 'anjo') {
        desenharPreviaDoPoder(ctx, poderEscolhido(jogador.poderes), peitoDo(jogador), telaParaMapa(cursor), tempo);
      } else if (jogador.arma?.tipo === 'arco') {
        desenharPreviaDoArco(ctx, jogador, telaParaMapa(cursor), tempo);
      }
    }
  }
  desenharAnimaisNoAr(ctx, luz, tempo, camX, LARGURA);
  ctx.restore();
}

// Os nomes em cima de cada um, na vista da câmera `camX` recortada como em desenharVista. O
// do outro vem primeiro: juntos, o nome dele é o que sobe. Os números de dano vêm por cima.
function desenharNomes(p: Partida, camX: number, x0: number, largura: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, largura, ALTURA);
  ctx.clip();
  ctx.translate(-camX, 0);
  desenharEtiquetas(
    ctx,
    [
      { etiqueta: p.ele, x: p.outro.x, y: p.outro.y, acima: acimaDaCabeca(p.outro) },
      { etiqueta: p.eu, x: p.jogador.x, y: p.jogador.y, acima: acimaDaCabeca(p.jogador) },
    ],
    { x: camX + x0, largura },
  );
  desenharNumerosDeDano(ctx, p.efeitos);
  ctx.restore();
}

// A linha no meio da tela dividida: um vão escuro com um fio claro de cada lado. Vai
// aparecendo conforme as câmeras se afastam, junto com a diferença entre as metades.
function desenharDivisao(forca: number): void {
  ctx.fillStyle = `rgba(18, 22, 38, ${0.85 * forca})`;
  ctx.fillRect(METADE - 1, 0, 2, ALTURA);
  ctx.fillStyle = `rgba(255, 250, 235, ${0.45 * forca})`;
  ctx.fillRect(METADE - 2, 0, 1, ALTURA);
  ctx.fillRect(METADE + 1, 0, 1, ALTURA);
}

// `tempo` em segundos desde o início: move sol, nuvens, o balanço das árvores e a luz.
function desenhar(tempo: number): void {
  const luz = luzDoSol(tempo, LARGURA);
  const { esquerda, direita, dividida } = camerasNaTela();
  if (dividida) {
    desenharVista(tempo, luz, esquerda, 0, METADE);
    desenharVista(tempo, luz, direita, METADE, METADE);
  } else {
    desenharVista(tempo, luz, esquerda, 0, LARGURA);
  }
  desenharLuz(ctx, luz, LARGURA, ALTURA);
  const p = partida;
  if (!p) return;
  // Os nomes vêm depois da luz, para o sol não tingir o azul e o vermelho.
  if (dividida) {
    desenharNomes(p, esquerda, 0, METADE);
    desenharNomes(p, direita, METADE, METADE);
  } else {
    desenharNomes(p, esquerda, 0, LARGURA);
  }
  if (dividida) desenharDivisao(Math.min(1, Math.abs(direita - esquerda) / DIVISAO_APARECE));
  // Enfeitiçado, a sua tela ganha a borda rosa (por baixo dos painéis).
  if (p.jogador.encanto) desenharBordaDoEncanto(ctx, p.jogador.encanto, LARGURA, ALTURA, tempo);
  // Os painéis ficam sempre no mesmo canto: o seu à esquerda, o do outro à direita.
  desenharPainel(ctx, p.jogador, p.eu, 'esquerda', LARGURA, tempo, true);
  desenharPainel(ctx, p.outro, p.ele, 'direita', LARGURA, tempo);
  desenharCronometro(ctx, p.restanteMs, LARGURA, tempo);
}

// A mira é o cursor do sistema (interface/mira.ts): na partida, fora do menu e antes do fim.
function atualizarMira(): void {
  const p = partida;
  aplicarMira(ctx.canvas, p &&!p.menuAberto && !p.acabou ? (acaoPronta(p) ? 'pronta' : 'apagada') : null);
}

let ultimoTempo = 0;
function loop(tempoAtual: number): void {
  const dt = ultimoTempo ? Math.min((tempoAtual - ultimoTempo) / 1000, 1 / 30) : 0;
  ultimoTempo = tempoAtual;

  atualizar(dt, tempoAtual / 1000);
  desenhar(tempoAtual / 1000);
  atualizarMira();
  requestAnimationFrame(loop);
}

// Título e texto da tela de fim. `venceu` só vale no fim por morte.
function textoDoFim(motivo: FimDaPartida, venceu: boolean | null, oponente: string): { titulo: string; texto: string } {
  if (motivo === 'morte') {
    return venceu
      ? { titulo: 'Vitória', texto: `${oponente} caiu. Você venceu!` }
      : { titulo: 'Derrota', texto: `${oponente} venceu.` };
  }
  const texto = {
    tempo: 'O tempo acabou.',
    'oponente-saiu': `${oponente} saiu da partida.`,
    conexao: 'A conexão com o servidor caiu.',
  }[motivo];
  return { titulo: 'Fim de partida', texto };
}

// No fim por morte, a tela espera um pouco: dá para ver o último golpe e quem caiu.
const ESPERA_FIM_MORTE = 1200; // ms

// Uma partida inteira: começa, roda até o tempo acabar (ou alguém sair) e termina quando a
// pessoa volta ao menu.
function jogar(escolha: Escolha): Promise<void> {
  return new Promise((resolver) => {
    const sair = (): void => {
      if (!partida) return;
      encerrarPartida(partida);
      partida = null;
      camera.esquerda = camera.direita = CAMERA_NO_MEIO;
      camera.dividida = false;
      resolver();
    };
    const menus = montarMenus({
      online: escolha.modo === 'online',
      aoMudarMenu: (aberto) => {
        if (partida) partida.menuAberto = aberto;
        if (aberto) soltarTeclas();
      },
      aoSair: sair,
    });
    const nova = criarPartida(escolha, (motivo, venceu) => {
      const oponente = escolha.modo === 'online' ? escolha.oponente : 'A CPU';
      const { titulo, texto } = textoDoFim(motivo, venceu, oponente);
      const mostrar = (): void => void menus.mostrarFim(titulo, texto).then(sair);
      if (motivo === 'morte') setTimeout(mostrar, ESPERA_FIM_MORTE);
      else mostrar();
    });
    // Começa com a câmera já entre os dois (sem deslizar do meio do mapa).
    camera.esquerda = camera.direita = limitarCamera((nova.jogador.x + nova.outro.x) / 2 - METADE);
    // Teclas apertadas nas telas (o Enter do botão) não valem no jogo.
    soltarTeclas();
    partida = nova;
  });
}

// Carregamento primeiro (confere a arte, o servidor e o banco); depois o cenário começa a rodar
// atrás da tela inicial e, a cada partida que acaba, a tela inicial volta.
async function principal(): Promise<void> {
  const { cenario, herois, online } = await carregar({
    carregarCenario: carregarFolhaCenario,
    carregarHerois: carregarAnimacoesPersonagem,
  });
  prepararPersonagens(herois, Y_CHAO);
  prepararPoderes(Y_CHAO);
  prepararArmas(Y_CHAO);
  folhaCenario = cenario;
  prepararAnimais(cenario, Y_CHAO);
  prepararMinhocas(Y_CHAO, ALTURA_CHAO);
  requestAnimationFrame(loop);

  for (;;) await jogar(await escolherModo(online));
}

void principal();
