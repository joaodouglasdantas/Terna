// O ganso da Margo (da folha dela, separado por ferramentas/separar-ganso.py e recortado por
// ferramentas/gerar-herois.cjs em assets/margo/ganso.png e ganso-bravo.png). Olha para a direita;
// para a esquerda, o quadro é espelhado.
//
// No dia a dia ele é o companheiro: anda atrás dela, um passo para trás, e para quando ela para
// (de lado, olhando para onde ela olha). Não é alvo de nada nem atrapalha ninguém: é só ela que
// luta. Na ult (o Ganso Raivoso, margo/poderes.ts) ele sai daqui, fica bravo e maior, corre atrás do
// outro e, quando a raiva passa, volta e vira o companheiro de novo, onde chegou.

import urlGansoBravo from '../../assets/margo/ganso-bravo.png';
import urlGanso from '../../assets/margo/ganso.png';
import { QUADROS_GANSO_BRAVO } from '../../gerado/ganso-bravo-quadros';
import { QUADROS_GANSO } from '../../gerado/ganso-quadros';
import { carregarImagem, contexto2d, novoCanvas } from '../../motor/imagens';
import type { Sprite } from '../../motor/tipos';

type Tabela = readonly { x: number; y: number; w: number; h: number; ax: number }[];

function recortar(folha: HTMLImageElement, tabela: Tabela): Sprite[] {
  return tabela.map((q) => {
    const canvas = novoCanvas(q.w, q.h);
    contexto2d(canvas).drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
    return { imagem: canvas, eixo: q.ax };
  });
}

const sprites = { parado: [] as Sprite[], andando: [] as Sprite[], correndo: [] as Sprite[], bicando: [] as Sprite[] };

export async function carregarGanso(): Promise<void> {
  const [calmo, bravo] = await Promise.all([carregarImagem(urlGanso), carregarImagem(urlGansoBravo)]);
  sprites.parado = recortar(calmo, QUADROS_GANSO.parado);
  sprites.andando = recortar(calmo, QUADROS_GANSO.andando);
  sprites.correndo = recortar(bravo, QUADROS_GANSO_BRAVO.correndo);
  sprites.bicando = recortar(bravo, QUADROS_GANSO_BRAVO.bicando);
}

// ---- O companheiro ----

const ATRAS = 13; // px atrás dela (do eixo dela ao dele)
const PERTO = 3; // chegou: para
const ANDA = 80; // px/s andando atrás dela (ela anda a 90: ele vai ficando um pouco para trás)
const CORRE = 150; // px/s quando ficou longe (ela correu, deu o arranco)
const LONGE = 40; // a partir daqui ele corre
const SUMIU = 160; // mais longe que isto (o corpo dela pulou de lugar, online), ele aparece do lado dela
const PASSO = 0.1; // segundos por quadro andando
const OLHAR = 1.6; // segundos parado entre um quadro e outro (ele mexe a cabeça)

export interface Companheiro {
  x: number;
  direcao: 1 | -1;
  andando: boolean;
  tempo: number; // da animação
  fora: boolean; // na ult: ele está lá fora, bravo (não aparece aqui)
}

export function criarCompanheiro(x: number, direcao: 1 | -1): Companheiro {
  return { x: x - direcao * ATRAS, direcao, andando: false, tempo: 0, fora: false };
}

// Um quadro do companheiro, atrás de quem ele segue (`dona`: o eixo e para onde ela olha).
export function atualizarCompanheiro(g: Companheiro, dona: { x: number; direcao: 1 | -1; vida: number }, dt: number): void {
  g.tempo += dt;
  if (g.fora) return;
  const alvo = dona.x - dona.direcao * ATRAS;
  const falta = alvo - g.x;
  if (Math.abs(falta) > SUMIU) {
    g.x = alvo;
    g.andando = false;
    return;
  }
  if (Math.abs(falta) <= PERTO) {
    g.andando = false;
    // Parado, olha para onde ela olha (caída, para ela).
    g.direcao = dona.vida > 0 ? dona.direcao : dona.x >= g.x ? 1 : -1;
    return;
  }
  const velocidade = Math.abs(falta) > LONGE ? CORRE : ANDA;
  g.x += Math.sign(falta) * Math.min(Math.abs(falta), velocidade * dt);
  g.direcao = falta > 0 ? 1 : -1;
  g.andando = true;
}

// O ganso voltou da ult: aparece onde chegou.
export function voltarCompanheiro(g: { x: number; direcao: 1 | -1; fora: boolean }, x: number, direcao: 1 | -1): void {
  g.fora = false;
  g.x = x;
  g.direcao = direcao;
}

function desenharSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, yPes: number, lado: 1 | -1, afundar: number): void {
  const { imagem, eixo } = s;
  const topo = Math.round(yPes) - imagem.height + afundar;
  if (lado === -1) {
    ctx.save();
    ctx.translate(Math.round(x) + eixo, topo);
    ctx.scale(-1, 1);
    ctx.drawImage(imagem, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(imagem, Math.round(x) - eixo, topo);
  }
}

// A sombrinha dele no chão.
function sombra(ctx: CanvasRenderingContext2D, x: number, yChao: number, meia: number, alfa = 0.25): void {
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.fillStyle = '#10180c';
  ctx.fillRect(Math.round(x) - meia, yChao - 1, meia * 2, 2);
  ctx.restore();
}

// No chão (`yChao`), atrás da Margo: desenhado antes dela.
export function desenharCompanheiro(ctx: CanvasRenderingContext2D, g: Companheiro, yChao: number, afundar: number): void {
  if (g.fora) return;
  const quadros = g.andando ? sprites.andando : sprites.parado;
  if (!quadros.length) return;
  const i = Math.floor(g.tempo / (g.andando ? PASSO : OLHAR)) % quadros.length;
  sombra(ctx, g.x, yChao, 5);
  desenharSprite(ctx, quadros[i], g.x, yChao, g.direcao, afundar);
}

// ---- O Ganso Raivoso (a imagem; o que ele faz fica em margo/poderes.ts) ----

const PASSO_BRAVO = 0.06; // segundos por quadro correndo: as patinhas voando

// O ganso bravo em `x`, com os pés no chão. `estufa`: de 0 a 1, ele crescendo do tamanho do calmo
// até o bravo (o começo da raiva). `bicando`: o bote com o pescoço esticado. `parado`: sem correr
// (estufando, ou esperando do lado dele).
export function desenharGansoBravo(
  ctx: CanvasRenderingContext2D,
  x: number,
  yChao: number,
  lado: 1 | -1,
  tempo: number,
  afundar: number,
  estado: { estufa: number; bicando: boolean; correndo: boolean },
): void {
  if (!sprites.correndo.length) return;
  const s = estado.bicando
    ? sprites.bicando[0]
    : estado.correndo
      ? sprites.correndo[Math.floor(tempo / PASSO_BRAVO) % sprites.correndo.length]
      : sprites.correndo[0];
  sombra(ctx, x, yChao, 8, 0.3);
  if (estado.estufa >= 1) {
    desenharSprite(ctx, s, x, yChao, lado, afundar);
    return;
  }
  // Estufando: o ganso calmo cresce até o tamanho do bravo e, no fim, vira ele.
  const calmo = sprites.parado[0];
  const escala = 1 + (s.imagem.height / calmo.imagem.height - 1) * estado.estufa;
  const tremor = Math.sin(tempo * 60) > 0 ? 1 : 0;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x) + tremor, Math.round(yChao) + afundar);
  ctx.scale(lado * escala, escala);
  ctx.drawImage(calmo.imagem, -calmo.eixo, -calmo.imagem.height);
  ctx.restore();
}

// A altura do ganso bravo, para as faíscas e o vapor saírem da cabeça dele.
export function alturaDoGansoBravo(): number {
  return sprites.correndo[0]?.imagem.height ?? 18;
}
