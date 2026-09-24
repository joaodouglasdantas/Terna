// Ponto de entrada do jogo: carrega as folhas de sprite, monta o mundo e roda o laço
// principal (atualizar → desenhar) a cada quadro do navegador.

import { MUNDO } from '@terna/compartilhado';
import { atualizarAnimais, desenharAnimais, desenharAnimaisNoAr, prepararAnimais } from './entidades/animais';
import {
  acimaDaCabeca,
  atualizarPersonagem,
  carregarAnimacoesPersonagem,
  criarPersonagem,
  desenharPersonagem,
  desenharSombraDoPersonagem,
  prepararPersonagens,
  type Controles,
  type Personagem,
} from './entidades/personagem';
import { criarCerebroSosia, pensarSosia, type CerebroSosia } from './entidades/sosia';
import { desenharEtiquetas, type Etiqueta } from './interface/etiqueta';
import { desenharPainel, type CorDoJogador } from './interface/painel';
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
import { acordarServidor } from './rede/endereco';

// Publicado (com o servidor em outro endereço), já começa a acordar o servidor.
if (import.meta.env.VITE_API_URL) acordarServidor();

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
// O sósia começa um pouco à direita, olhando para você, e anda em volta desse lugar.
const CASA_SOSIA = MUNDO / 2 + 70;
// Quem é quem, na cor de cada um — você em azul, o sósia em vermelho: o nome em cima da cabeça,
// a borda do painel e o fundo da foto (a `clara`).
const PLAYER_1: Etiqueta & CorDoJogador = { texto: 'PLAYER 1', cor: '#5fb2ff', clara: '#d3e9ff' };
const PLAYER_2: Etiqueta & CorDoJogador = { texto: 'PLAYER 2', cor: '#ff5a67', clara: '#ffd8dc' };

let folhaCenario: HTMLImageElement;
// Você começa no meio do mapa, com espaço para andar para os dois lados.
let jogador: Personagem;
let sosia: Personagem;
let cerebroSosia: CerebroSosia;

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
const camera = { esquerda: (MUNDO - LARGURA) / 2, direita: (MUNDO - LARGURA) / 2, dividida: false };

const limitarCamera = (x: number): number => Math.max(0, Math.min(MUNDO - LARGURA, x));

function atualizarCamera(dt: number): void {
  const [a, b] = jogador.x <= sosia.x ? [jogador.x, sosia.x] : [sosia.x, jogador.x];
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
});
window.addEventListener('keyup', (evento) => {
  teclas[evento.code] = false;
});

function lerTeclado(): Controles {
  return {
    esquerda: Boolean(teclas['ArrowLeft'] || teclas['KeyA']),
    direita: Boolean(teclas['ArrowRight'] || teclas['KeyD']),
    pular: Boolean(teclas['Space'] || teclas['ArrowUp'] || teclas['KeyW']),
    transformar: Boolean(teclas['KeyR']), // R alterna entre a forma base e a de anjo
  };
}

function atualizar(dt: number, tempo: number): void {
  atualizarPersonagem(jogador, lerTeclado(), dt, tempo);
  atualizarPersonagem(sosia, pensarSosia(cerebroSosia, sosia, dt), dt, tempo);

  atualizarCamera(dt);
  const { esquerda, direita } = camerasNaTela();
  atualizarPassaros(dt, LARGURA, esquerda, direita);
  atualizarAnimais(dt, [jogador, sosia], vistas());
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

  // O sósia atrás e você na frente, quando um passa pelo outro.
  desenharSombraDoPersonagem(ctx, sosia, luz);
  desenharSombraDoPersonagem(ctx, jogador, luz);
  desenharPersonagem(ctx, sosia, tempo);
  desenharPersonagem(ctx, jogador, tempo);
  desenharAnimaisNoAr(ctx, luz, tempo, camX, LARGURA);
  ctx.restore();
}

// Os nomes em cima de cada um, na vista da câmera `camX` recortada como em desenharVista. O
// sósia vem primeiro: juntos, o nome dele é o que sobe.
function desenharNomes(camX: number, x0: number, largura: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, largura, ALTURA);
  ctx.clip();
  ctx.translate(-camX, 0);
  desenharEtiquetas(
    ctx,
    [
      { etiqueta: PLAYER_2, x: sosia.x, y: sosia.y, acima: acimaDaCabeca(sosia) },
      { etiqueta: PLAYER_1, x: jogador.x, y: jogador.y, acima: acimaDaCabeca(jogador) },
    ],
    { x: camX + x0, largura },
  );
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
  // Os nomes vêm depois da luz, para o sol não tingir o azul e o vermelho.
  if (dividida) {
    desenharNomes(esquerda, 0, METADE);
    desenharNomes(direita, METADE, METADE);
  } else {
    desenharNomes(esquerda, 0, LARGURA);
  }
  if (dividida) desenharDivisao(Math.min(1, Math.abs(direita - esquerda) / DIVISAO_APARECE));
  // Os painéis ficam sempre no mesmo canto: o seu à esquerda, o do sósia à direita.
  desenharPainel(ctx, jogador, PLAYER_1, 'esquerda', LARGURA, tempo);
  desenharPainel(ctx, sosia, PLAYER_2, 'direita', LARGURA, tempo);
}

let ultimoTempo = 0;
function loop(tempoAtual: number): void {
  const dt = ultimoTempo ? Math.min((tempoAtual - ultimoTempo) / 1000, 1 / 30) : 0;
  ultimoTempo = tempoAtual;

  atualizar(dt, tempoAtual / 1000);
  desenhar(tempoAtual / 1000);
  requestAnimationFrame(loop);
}

Promise.all([carregarAnimacoesPersonagem(), carregarFolhaCenario()]).then(([animacoes, folha]) => {
  prepararPersonagens(animacoes, Y_CHAO);
  jogador = criarPersonagem(MUNDO / 2);
  sosia = criarPersonagem(CASA_SOSIA, -1);
  cerebroSosia = criarCerebroSosia(CASA_SOSIA);
  folhaCenario = folha;
  prepararAnimais(folha, Y_CHAO);
  prepararMinhocas(Y_CHAO, ALTURA_CHAO);
  requestAnimationFrame(loop);
});
