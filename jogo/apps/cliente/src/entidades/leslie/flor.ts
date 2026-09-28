// A Flor Carnívora, a ult da Leslie (números em compartilhado/conteudo/leslie.ts, FLOR). Da folha
// "flor carnívora" (fontes/flor.png, recortada por ferramentas/gerar-herois.cjs em
// assets/leslie/flor.png): parada, andando, cuspindo, brotando e murchando. Olha para a direita;
// para a esquerda, o quadro é espelhado.
//
// A terra treme onde a Leslie mirou, a flor sobe de dentro dela e fica de pé um tempo: vai atrás
// do outro (sem chegar colada) e, de tempos em tempos, agacha e cospe uma bola de veneno nele, que
// voa reto e longe. No fim, murcha e estoura num respingo de veneno (só a imagem).
//
// Online, a flor dos dois lados sai do mesmo uso e anda atrás do mesmo corpo; quem confere se a
// bola acertou é o lado de quem apanha (efeitos.ts), como nos outros poderes.

import { FLOR, MUNDO, type PoderUsado } from '@terna/compartilhado';
import urlFlor from '../../assets/leslie/flor.png';
import { QUADROS_FLOR } from '../../gerado/flor-quadros';
import { carregarImagem, contexto2d, novoCanvas } from '../../motor/imagens';
import type { Sprite } from '../../motor/tipos';
import {
  acertaCorpo,
  chao,
  faisca,
  ferirAlvo,
  limitarAoAlcance,
  redesenharGrama,
  vivos,
  type Alvo,
  type Ameacas,
  type Dono,
  type Nucleo,
} from '../efeitos';

type NomeQuadro = keyof typeof QUADROS_FLOR;
let quadros: Record<NomeQuadro, Sprite[]> | null = null;

export async function carregarFlor(): Promise<void> {
  const folha = await carregarImagem(urlFlor);
  const recortados = {} as Record<NomeQuadro, Sprite[]>;
  for (const nome of Object.keys(QUADROS_FLOR) as NomeQuadro[]) {
    recortados[nome] = QUADROS_FLOR[nome].map((q) => {
      const canvas = novoCanvas(q.w, q.h);
      contexto2d(canvas).drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
      return { imagem: canvas, eixo: q.ax };
    });
  }
  quadros = recortados;
}

// As cores do veneno e da terra (as da folha).
const VENENO = { escuro: '#3f8a1c', medio: '#76c83a', claro: '#b8f25a', brilho: '#eaffb0' };
const TERRA = ['#3c2412', '#5a381c', '#6b4424', '#8a5a2b'];
const aoAcaso = <T>(lista: readonly T[]): T => lista[(Math.random() * lista.length) | 0];
const sortear = (min: number, max: number): number => min + Math.random() * (max - min);

// A boca, cuspindo: px para a frente do eixo e acima do chão (o quadro agachado).
const BOCA = { frente: 12, altura: 22 };
const AFUNDAR = 2; // os pés (as raízes) afundam na grama, como os dos personagens
const PASSO = 0.14; // segundos por quadro andando
const CUSPE = 0.3; // segundos de boca escancarada depois de cuspir

interface Tiro {
  x: number;
  y: number;
  vx: number;
  vy: number;
  percorrido: number;
}

export interface Flor {
  tipo: 'flor';
  dono: Dono;
  x: number; // o eixo, no chão
  lado: 1 | -1; // para onde olha
  idade: number; // desde o uso: o aviso, a subida, de pé e murchando
  proximo: number; // de pé: segundos até a próxima cusparada
  cuspindo: number; // segundos desde que agachou para cuspir (-1: não está cuspindo)
  andou: number; // o tempo da animação de andar
  andando: boolean;
  tiros: Tiro[];
  rachaduras: number[];
}

type Efeitos = Nucleo<{ dono: Dono }>;

const DE_PE = FLOR.aviso + FLOR.brota; // a idade em que ela fica de pé
const FIM = DE_PE + FLOR.duracao; // a idade em que começa a murchar

export function criarFlor(dono: Dono, uso: PoderUsado): Flor {
  return {
    tipo: 'flor',
    dono,
    x: ondeBrota(uso.x, uso.alvoX),
    lado: uso.alvoX >= uso.x ? 1 : -1,
    idade: 0,
    proximo: FLOR.primeiro,
    cuspindo: -1,
    andou: 0,
    andando: false,
    tiros: [],
    rachaduras: Array.from({ length: 6 }, (_, i) => Math.round((i / 5 - 0.5) * 34 + sortear(-2, 2))),
  };
}

// Quem ela persegue: o outro de pé mais perto dela.
function presa(f: Flor, alvos: readonly Alvo[]): Alvo | null {
  let melhor: Alvo | null = null;
  for (const a of vivos(alvos, f.dono)) if (!melhor || Math.abs(a.corpo.x - f.x) < Math.abs(melhor.corpo.x - f.x)) melhor = a;
  return melhor;
}

function particulaDeTerra(e: Efeitos, x: number, forca: number): void {
  const a = -Math.PI / 2 + sortear(-0.9, 0.9);
  const v = forca * sortear(0.5, 1);
  const total = sortear(0.6, 1.1);
  e.particulas.push({ x, y: chao() - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, gravidade: 420, vida: total, total, cor: aoAcaso(TERRA), somar: false, pousar: true });
}

// Uma gota de veneno que cai e fica no chão um instante.
function gota(e: Efeitos, x: number, y: number, forca: number): void {
  const a = sortear(0, Math.PI * 2);
  const v = forca * sortear(0.3, 1);
  const total = sortear(0.4, 0.8);
  e.particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, gravidade: 380, vida: total, total, cor: aoAcaso([VENENO.escuro, VENENO.medio, VENENO.claro]), somar: false, pousar: true });
}

function respingar(e: Efeitos, x: number, y: number): void {
  for (let k = 0; k < 12; k++) gota(e, x, y, 70);
  for (let k = 0; k < 6; k++) faisca(e, x, y, 50, 0, VENENO.brilho);
}

// Passa o tempo da flor e das bolas dela; devolve se ainda tem algo dela no mapa.
export function atualizarFlor(e: Efeitos, f: Flor, dt: number, alvos: readonly Alvo[]): boolean {
  f.idade += dt;
  atualizarTiros(e, f, dt, alvos);
  if (f.idade < FLOR.aviso) {
    // A terra treme e solta torrões pelas rachaduras, mais perto da hora.
    if (Math.random() < dt * 18 * (0.4 + f.idade / FLOR.aviso)) particulaDeTerra(e, f.x + aoAcaso(f.rachaduras), 30 + 40 * (f.idade / FLOR.aviso));
    return true;
  }
  if (f.idade < DE_PE) {
    // Rompendo a terra.
    if (f.idade - dt < FLOR.aviso) for (let k = 0; k < 16; k++) particulaDeTerra(e, f.x + sortear(-16, 16), 110);
    return true;
  }
  if (f.idade < FIM) {
    const alvo = presa(f, alvos);
    f.andando = false;
    if (f.cuspindo >= 0) {
      const antes = f.cuspindo;
      f.cuspindo += dt;
      // Agachou o bastante: cospe na direção de onde ele está agora.
      if (antes < FLOR.prepara && f.cuspindo >= FLOR.prepara) cuspir(e, f, alvo);
      if (f.cuspindo >= FLOR.prepara + CUSPE) {
        f.cuspindo = -1;
        f.proximo = FLOR.intervalo - FLOR.prepara - CUSPE;
      }
    } else if (alvo) {
      const dx = alvo.corpo.x - f.x;
      if (Math.abs(dx) >= 1) f.lado = dx > 0 ? 1 : -1;
      // Vai atrás dele, sem chegar colada.
      if (Math.abs(dx) > FLOR.distancia + 4) {
        f.x = Math.max(20, Math.min(MUNDO - 20, f.x + f.lado * FLOR.velocidade * dt));
        f.andando = true;
        f.andou += dt;
      }
      f.proximo -= dt;
      if (f.proximo <= 0) f.cuspindo = 0;
    }
    // Pinga veneno da boca de vez em quando.
    if (Math.random() < dt * 2.5) gota(e, f.x + f.lado * (BOCA.frente - 2), chao() - BOCA.altura - 6, 10);
    return true;
  }
  if (f.idade - dt < FIM) {
    // Murchou: o veneno estoura pelos lados (só a imagem).
    for (let k = 0; k < 26; k++) gota(e, f.x + sortear(-10, 10), chao() - sortear(4, 16), 110);
  }
  return f.idade < FIM + FLOR.murcha || f.tiros.length > 0;
}

function cuspir(e: Efeitos, f: Flor, alvo: Alvo | null): void {
  if (!alvo) return;
  const bx = f.x + f.lado * BOCA.frente;
  const by = chao() - BOCA.altura;
  // Na altura do peito dele.
  let dx = alvo.corpo.x - bx;
  let dy = alvo.corpo.y - alvo.corpo.medida.altura * 0.55 - by;
  const d = Math.hypot(dx, dy);
  [dx, dy] = d < 1 ? [f.lado, 0] : [dx / d, dy / d];
  // Nunca para trás: ela cospe para o lado que olha.
  if (dx * f.lado < 0.2) {
    dx = f.lado * 0.2;
    const n = Math.hypot(dx, dy);
    [dx, dy] = [dx / n, dy / n];
  }
  f.tiros.push({ x: bx, y: by, vx: dx * FLOR.tiro.velocidade, vy: dy * FLOR.tiro.velocidade, percorrido: 0 });
  for (let k = 0; k < 6; k++) gota(e, bx, by, 40);
}

function atualizarTiros(e: Efeitos, f: Flor, dt: number, alvos: readonly Alvo[]): void {
  f.tiros = f.tiros.filter((t) => {
    // Em passos curtos, para a bola rápida não atravessar ninguém entre dois quadros.
    const partes = Math.max(1, Math.ceil((FLOR.tiro.velocidade * dt) / 3));
    for (let i = 0; i < partes; i++) {
      t.x += (t.vx * dt) / partes;
      t.y += (t.vy * dt) / partes;
      t.percorrido += (FLOR.tiro.velocidade * dt) / partes;
      const alvo = vivos(alvos, f.dono).find((a) => acertaCorpo(a.corpo, t.x, t.y, FLOR.tiro.raio));
      if (alvo) {
        ferirAlvo(e, alvo, FLOR.tiro.dano);
        respingar(e, t.x, t.y);
        return false;
      }
      if (t.y >= chao() - 1) {
        respingar(e, t.x, chao() - 2);
        return false;
      }
    }
    // Um rastro de gotinhas pelo caminho.
    if (Math.random() < dt * 20) gota(e, t.x, t.y, 8);
    return t.percorrido < FLOR.tiro.alcance && t.x > -10 && t.x < MUNDO + 10;
  });
}

// Para a CPU desviar: as bolas voando.
export function ameacasDaFlor(f: Flor, ameacas: Ameacas): void {
  for (const t of f.tiros) ameacas.projeteis.push({ x: t.x, y: t.y, vx: t.vx, vy: t.vy });
}

// ---- Desenho ----

// O quadro de agora e quanto dele fica abaixo do chão (subindo da terra).
function quadroDe(f: Flor, tempo: number): { sprite: Sprite; enterrado: number; alfa: number; balanco: number } | null {
  if (!quadros || f.idade < FLOR.aviso) return null;
  if (f.idade < DE_PE) {
    const u = (f.idade - FLOR.aviso) / FLOR.brota;
    const sprite = quadros.brotando[0];
    return { sprite, enterrado: Math.round(sprite.imagem.height * (1 - u) ** 2), alfa: 1, balanco: 0 };
  }
  if (f.idade < FIM) {
    if (f.cuspindo >= 0) return { sprite: quadros.cuspindo[f.cuspindo < FLOR.prepara ? 0 : 1], enterrado: 0, alfa: 1, balanco: 0 };
    if (f.andando) return { sprite: quadros.andando[Math.floor(f.andou / PASSO) % quadros.andando.length], enterrado: 0, alfa: 1, balanco: 0 };
    // Parada, respira: sobe e desce um pixel.
    return { sprite: quadros.parado[0], enterrado: 0, alfa: 1, balanco: Math.sin(tempo * 4 + f.x) > 0.3 ? 1 : 0 };
  }
  const u = (f.idade - FIM) / FLOR.murcha;
  if (u >= 1) return null;
  return { sprite: quadros.murchando[u < 0.45 ? 0 : 1], enterrado: 0, alfa: u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4, balanco: 0 };
}

// Antes dos personagens (eles passam na frente dela): as rachaduras do aviso e a flor.
export function desenharFlorNoChao(ctx: CanvasRenderingContext2D, f: Flor, tempo: number): void {
  const yChao = chao();
  if (f.idade < DE_PE) {
    // As rachaduras abrindo e a luz verde saindo delas.
    const p = Math.min(1, f.idade / FLOR.aviso);
    ctx.save();
    ctx.fillStyle = '#2a180c';
    for (const [i, rx] of f.rachaduras.entries()) {
      let x = Math.round(f.x + rx);
      for (let d = 1; d <= Math.round((3 + (i % 3) * 2) * p); d++) {
        if (d % 2 === 0) x += i % 2 ? 1 : -1;
        ctx.fillRect(x, yChao + d, 1, 1);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    const pisca = 0.75 + 0.25 * Math.sin(tempo * (18 + p * 30));
    for (const rx of f.rachaduras) {
      const luz = ctx.createLinearGradient(0, yChao + 2, 0, yChao - 24);
      luz.addColorStop(0, `rgba(170, 60, 190, ${0.4 * p * pisca})`);
      luz.addColorStop(1, 'rgba(170, 60, 190, 0)');
      ctx.fillStyle = luz;
      ctx.fillRect(Math.round(f.x + rx) - 2, yChao - 24, 5, 26);
    }
    ctx.restore();
    // A grama tremendo.
    if (f.idade < FLOR.aviso && p > 0.3 && Math.sin(tempo * 45 + f.x) > 0) redesenharGrama(ctx, f.x - 20, f.x + 20, 1, 1);
  }
  const q = quadroDe(f, tempo);
  if (!q) return;
  const { imagem, eixo } = q.sprite;
  const topo = yChao - imagem.height + AFUNDAR + q.enterrado - q.balanco;
  // A sombra no chão.
  ctx.save();
  ctx.globalAlpha = 0.28 * q.alfa;
  ctx.fillStyle = '#10180c';
  const meia = Math.round(imagem.width * 0.38);
  ctx.fillRect(Math.round(f.x) - meia, yChao - 1, meia * 2, 2);
  ctx.fillRect(Math.round(f.x) - meia + 2, yChao - 2, meia * 2 - 4, 1);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = q.alfa;
  // Subindo: só a parte acima da terra.
  if (q.enterrado > 0) {
    ctx.beginPath();
    ctx.rect(f.x - 60, yChao - 80, 120, 80 + AFUNDAR);
    ctx.clip();
  }
  const x = Math.round(f.x);
  if (f.lado === -1) {
    ctx.translate(x + eixo, topo);
    ctx.scale(-1, 1);
    ctx.drawImage(imagem, 0, 0);
  } else {
    ctx.drawImage(imagem, x - eixo, topo);
  }
  ctx.restore();
  // Subindo: a grama por cima da base, e a terra estufada em volta.
  if (q.enterrado > 0) redesenharGrama(ctx, f.x - 22, f.x + 22, 1);
}

// Depois dos personagens: as bolas de veneno voando, com o brilho em volta e o rastro.
export function desenharFlorNaFrente(ctx: CanvasRenderingContext2D, f: Flor): void {
  for (const t of f.tiros) {
    const v = Math.hypot(t.vx, t.vy) || 1;
    const [ux, uy] = [t.vx / v, t.vy / v];
    const x = Math.round(t.x);
    const y = Math.round(t.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const luz = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, 7);
    luz.addColorStop(0, 'rgba(160, 240, 80, 0.55)');
    luz.addColorStop(1, 'rgba(160, 240, 80, 0)');
    ctx.fillStyle = luz;
    ctx.fillRect(x - 7, y - 7, 14, 14);
    // O rastro: o veneno escorrendo para trás, afinando.
    for (let k = 1; k <= 7; k++) {
      ctx.globalAlpha = 0.7 * (1 - k / 8);
      ctx.fillStyle = k < 3 ? VENENO.claro : VENENO.medio;
      const lado = k % 2 ? 0 : Math.sin(k + t.percorrido * 0.3) > 0 ? 1 : -1;
      ctx.fillRect(Math.round(t.x - ux * (k + 1) - uy * lado), Math.round(t.y - uy * (k + 1) + ux * lado), 1, 1);
    }
    ctx.restore();
    // A bola: 4×4, contorno escuro, o verde, a luz em cima e o brilho.
    ctx.fillStyle = VENENO.escuro;
    ctx.fillRect(x - 1, y - 2, 3, 5);
    ctx.fillRect(x - 2, y - 1, 5, 3);
    ctx.fillStyle = VENENO.medio;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = VENENO.claro;
    ctx.fillRect(x - 1, y - 1, 2, 1);
    ctx.fillStyle = VENENO.brilho;
    ctx.fillRect(x - 1, y - 1, 1, 1);
  }
}

// A prévia da mira: onde ela vai brotar.
export function ondeBrota(origemX: number, alvoX: number): number {
  return Math.max(20, Math.min(MUNDO - 20, limitarAoAlcance(alvoX, origemX, FLOR.alcance, MUNDO)));
}
