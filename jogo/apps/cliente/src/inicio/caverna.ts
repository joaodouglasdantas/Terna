// O fundo da tela da conta: a caverna do musgo, com a cachoeira lá no fundo saindo pela boca dela
// (assets/tela-conta-caverna.webp), viva como a floresta dos menus (cena.ts):
// - a arte respira devagar e segue de leve o mouse (paralaxe);
// - o musgo pendurado no teto e a cortina de musgo balançam, as samambaias mexem, as cachoeiras
//   tremem e o lago ondula (pedaços da arte redesenhados em faixas finas, cada faixa deslocada por
//   uma onda, com a borda esfumada);
// - fios de água descem pelas cachoeiras, a espuma sobe no pé delas, gotas pingam das pontas do
//   teto, o lago brilha, poeira flutua na luz da lua que entra pela boca, vagalumes vagueiam e
//   caem folhas do musgo.
// Depois que a caverna chega, ela escurece: só ficam acesas as luzes — o fogo das duas tochas
// (que ilumina a pedra em volta e tremula com ele), o cristal da logo (dourado, pulsando), a lua
// da boca da caverna e a cachoeira, e um brilho fraco nos cogumelos. A logo também entra na luz
// da caverna: escurece junto, o alto fica dourado com o cristal, a parte de baixo pega o laranja
// das tochas lá embaixo (cada metade tremulando com a tocha do seu lado) e o lado da boca da
// caverna um azul fraco.
//
// As camadas, de baixo para cima: a arte (com os pedaços que mexem e as folhas), o corpo das
// tochas, a escuridão (com os buracos das luzes), a cor das luzes (somando luz), os pontos de luz
// (vagalumes, poeira, espuma, gotas, brilhos) e o fogo das tochas.

import logoUrl from '../assets/logo.webp';
import urlCaverna from '../assets/tela-conta-caverna.webp';
import { carregarDecodificada, contexto2d, novoCanvas, umaVez } from '../motor/imagens';
import { elemento } from './dom';
import { cair, desenharBrilho, desenharHalo, desenharFolha, folhaPronta, inclinacao, type Folha as DesenhoDeFolha, type Queda } from './efeitos';
import { MEIO_DO_FOGO, type Tocha } from './tocha';

type Area = { x0: number; x1: number; y0: number; y1: number };
type Ponto = { x: number; y: number };

// A arte tem uns 170 pixels de altura (cada um com uns 4,5 pixels da imagem).
const PIXELS_DE_ALTURA = 170;

// Os pedaços da arte que se mexem (fração do quadro; a borda é uma elipse esfumada). `onda`: a
// força (em pixels da imagem), o ritmo (rad/s), o tamanho da onda (rad por pixel da imagem, de
// cima para baixo) e quanto a força cresce descendo (1: preso em cima, como o musgo pendurado;
// negativo: preso embaixo, como a samambaia).
interface Pedaco {
  area: Area;
  onda: { forca: number; ritmo: number; passo: number; desce: number };
}
const PEDACOS: Pedaco[] = [
  // O musgo pendurado no teto: balança devagar, mais na ponta.
  { area: { x0: 0, x1: 0.36, y0: 0, y1: 0.32 }, onda: { forca: 3, ritmo: 1.0, passo: 0.03, desce: 1 } },
  { area: { x0: 0.34, x1: 0.68, y0: 0, y1: 0.3 }, onda: { forca: 2.6, ritmo: 1.15, passo: 0.03, desce: 1 } },
  { area: { x0: 0.66, x1: 1, y0: 0, y1: 0.34 }, onda: { forca: 3, ritmo: 0.95, passo: 0.03, desce: 1 } },
  // A cortina de musgo da esquerda.
  { area: { x0: 0.12, x1: 0.44, y0: 0.3, y1: 0.68 }, onda: { forca: 3.2, ritmo: 1.1, passo: 0.022, desce: 1 } },
  // As samambaias, presas embaixo.
  { area: { x0: 0.89, x1: 0.99, y0: 0.54, y1: 0.67 }, onda: { forca: 2.2, ritmo: 1.6, passo: 0.06, desce: -0.8 } },
  { area: { x0: 0.06, x1: 0.14, y0: 0.65, y1: 0.76 }, onda: { forca: 2, ritmo: 1.5, passo: 0.06, desce: -0.8 } },
  // As cachoeiras: a água treme depressa, em ondas curtas.
  { area: { x0: 0.703, x1: 0.728, y0: 0.26, y1: 0.39 }, onda: { forca: 1.2, ritmo: 9, passo: 0.6, desce: 0 } },
  { area: { x0: 0.722, x1: 0.76, y0: 0.42, y1: 0.66 }, onda: { forca: 1.4, ritmo: 9, passo: 0.5, desce: 0 } },
  { area: { x0: 0.725, x1: 0.772, y0: 0.665, y1: 0.72 }, onda: { forca: 1.2, ritmo: 9, passo: 0.5, desce: 0 } },
  // O lago ondula.
  { area: { x0: 0.38, x1: 0.82, y0: 0.74, y1: 0.88 }, onda: { forca: 2, ritmo: 2, passo: 0.3, desce: 0 } },
];
const FAIXA = 2; // altura de cada faixa redesenhada, em pixels da imagem

// Por onde a água desce (os fios claros), onde ela bate (a espuma), o lago (os brilhos), as pontas
// do teto (as gotas), a luz da lua (a poeira), o musgo (as folhas) e os cogumelos.
const QUEDAS: Area[] = [
  { x0: 0.708, x1: 0.722, y0: 0.27, y1: 0.385 },
  { x0: 0.729, x1: 0.753, y0: 0.43, y1: 0.65 },
  { x0: 0.731, x1: 0.765, y0: 0.675, y1: 0.715 },
];
const PES_DAS_QUEDAS = [
  { x: 0.716, y: 0.39, largura: 0.018 },
  { x: 0.741, y: 0.655, largura: 0.032 },
  { x: 0.748, y: 0.72, largura: 0.04 },
];
const LAGO: Area = { x0: 0.42, x1: 0.8, y0: 0.76, y1: 0.87 };
const PONTAS_DO_TETO: Ponto[] = [
  { x: 0.44, y: 0.21 },
  { x: 0.5, y: 0.27 },
  { x: 0.555, y: 0.22 },
  { x: 0.6, y: 0.38 },
  { x: 0.64, y: 0.33 },
  { x: 0.79, y: 0.27 },
  { x: 0.83, y: 0.24 },
  { x: 0.57, y: 0.46 },
];
const LUZ_DA_LUA: Area = { x0: 0.6, x1: 0.86, y0: 0.14, y1: 0.62 };
const BOCA: Ponto = { x: 0.71, y: 0.24 };
const CACHOEIRA: Ponto = { x: 0.74, y: 0.55 };
const MUSGOS: Area[] = [
  { x0: 0.02, x1: 0.34, y0: 0.05, y1: 0.3 },
  { x0: 0.14, x1: 0.42, y0: 0.34, y1: 0.6 },
  { x0: 0.7, x1: 0.98, y0: 0.05, y1: 0.28 },
];
const COGUMELOS: Ponto[] = [
  { x: 0.062, y: 0.815 },
  { x: 0.078, y: 0.828 },
  { x: 0.866, y: 0.822 },
];
// O cristal da logo da conta (fração da imagem da logo).
const CRISTAL: Ponto = { x: 0.5, y: 0.135 };

// Os verdes do musgo da arte, para as folhas que caem.
const VERDES = ['#213623', '#31460d', '#495815', '#607a31', '#8aa63c'];

const VAGALUMES = 14;
const POEIRA = 28;
const FOLHAS_POR_SEGUNDO = 0.35; // por trecho de musgo
// A escuridão: quão escura fica (0 a 1), quando começa a cair (s depois de a tela abrir) e
// quanto leva.
const ESCURIDAO = 0.9;
const ESCURECE_EM = 0.7;
const ESCURECE_POR = 1.8;
// A paralaxe: até quanto (fração do quadro) a arte anda seguindo o mouse, e quão depressa chega.
const PARALAXE = 0.012;
const SEGUE = 2.5; // por segundo

interface FolhaCaindo extends Queda {
  desenho: DesenhoDeFolha;
  profundidade: number;
}

interface Luz {
  tipo: 'vagalume' | 'poeira' | 'espuma' | 'fio' | 'brilho' | 'gota';
  x: number; // em pixels do quadro da arte (antes da paralaxe)
  y: number;
  vx: number;
  vy: number;
  rumo: number;
  velocidade: number;
  fase: number;
  vida: number;
  duracao: number;
  ate: number; // a gota: até onde cai (y)
}

export interface Caverna {
  el: HTMLElement;
  // Um quadro: `dt` em segundos.
  quadro(dt: number): void;
}

export const carregarArteDaCaverna = umaVez(() => carregarDecodificada(urlCaverna));

const sortear = (min: number, max: number): number => min + Math.random() * (max - min);
const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)];
const semMovimento = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const suave = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

// Cada pedaço que se mexe, recortado da arte uma vez, com a borda esfumada (a elipse).
function recortar(img: HTMLImageElement): { pedaco: Pedaco; canvas: HTMLCanvasElement }[] {
  return PEDACOS.map((pedaco) => {
    const { x0, x1, y0, y1 } = pedaco.area;
    const sx = Math.round(x0 * img.naturalWidth);
    const sy = Math.round(y0 * img.naturalHeight);
    const w = Math.round((x1 - x0) * img.naturalWidth);
    const h = Math.round((y1 - y0) * img.naturalHeight);
    const canvas = novoCanvas(w, h);
    const c = contexto2d(canvas);
    c.drawImage(img, sx, sy, w, h, 0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    c.translate(w / 2, h / 2);
    c.scale(w / 2, h / 2);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, '#000');
    g.addColorStop(0.6, '#000');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = g;
    c.fillRect(-1, -1, 2, 2);
    return { pedaco, canvas };
  });
}

// `tochas`: as duas tochas (o corpo vai por baixo da escuridão e o fogo por cima). `logo`: a caixa
// da logo da tela, do tamanho da imagem (a luz do cristal sai dela, e a luz da caverna é pintada
// por cima dela, recortada no desenho da logo).
export function criarCaverna(tochas: Tocha[], logo: HTMLElement): Caverna {
  const el = elemento('div', 'inicio-caverna');
  el.setAttribute('aria-hidden', 'true');
  const arte = elemento('div', 'inicio-caverna-arte');
  const fundo = elemento('div', 'inicio-caverna-fundo');
  fundo.style.backgroundImage = `url("${urlCaverna}")`;
  const vida = elemento('canvas', 'inicio-caverna-vida');
  arte.append(fundo, vida);
  const escuro = elemento('canvas', 'inicio-caverna-escuro');
  const cores = elemento('canvas', 'inicio-caverna-luzes');
  const pontos = elemento('canvas', 'inicio-caverna-pontos');
  el.append(arte, ...tochas.map((t) => t.el), escuro, cores, pontos, ...tochas.map((t) => t.fogo));
  // A luz na logo: a sombra (por cima, normal) e a cor (somando luz), as duas recortadas pela
  // própria imagem da logo (máscara).
  const sombraDaLogo = elemento('canvas', 'inicio-conta-logo-luz');
  const corDaLogo = elemento('canvas', 'inicio-conta-logo-luz inicio-conta-logo-cor');
  for (const c of [sombraDaLogo, corDaLogo]) {
    c.style.maskImage = `url("${logoUrl}")`;
    c.style.webkitMaskImage = `url("${logoUrl}")`;
  }
  logo.append(sombraDaLogo, corDaLogo);
  let proximoBrilho = 2.5; // s até o próximo brilho de quatro pontas no cristal
  let brilhoDoCristal = 0; // de 1 a 0 enquanto brilha

  let recortes: { pedaco: Pedaco; canvas: HTMLCanvasElement }[] = [];
  carregarArteDaCaverna().then(
    (img) => (recortes = recortar(img)),
    () => undefined, // sem os recortes, a arte só não balança
  );

  let largura = 0;
  let altura = 0;
  let u = 1; // um pixel da arte na tela
  const medir = (): void => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w === largura && h === altura) return;
    largura = w;
    altura = h;
    u = altura / PIXELS_DE_ALTURA;
    for (const canvas of [vida, escuro, cores, pontos]) {
      canvas.width = largura;
      canvas.height = altura;
    }
  };

  // A paralaxe e a respiração: a arte anda para o lado contrário do mouse e cresce e encolhe
  // devagar. `paraTela` leva um ponto da arte para onde ele aparece (os pontos de luz e a lua
  // ficam fora da arte, por cima da escuridão, e precisam acompanhar).
  const mouse = { x: 0, y: 0 };
  const paralaxe = { x: 0, y: 0 };
  let escala = 1.04;
  const paraTela = (x: number, y: number): Ponto => ({
    x: largura / 2 + (x - largura / 2) * escala + paralaxe.x * largura,
    y: altura / 2 + (y - altura / 2) * escala + paralaxe.y * altura,
  });
  const fracao = (p: Ponto): Ponto => paraTela(p.x * largura, p.y * altura);
  const vigia = new AbortController();
  window.addEventListener(
    'pointermove',
    (evento) => {
      mouse.x = Math.max(-1, Math.min(1, (evento.clientX / innerWidth) * 2 - 1));
      mouse.y = Math.max(-1, Math.min(1, (evento.clientY / innerHeight) * 2 - 1));
    },
    { signal: vigia.signal },
  );

  let folhas: FolhaCaindo[] = [];
  let luzes: Luz[] = [];
  const acumulado = { folhas: MUSGOS.map(() => 0), espuma: PES_DAS_QUEDAS.map(() => 0), fios: QUEDAS.map(() => 0), brilhos: 0, gotas: 0 };
  let tempo = 0;

  const nova = (tipo: Luz['tipo'], x: number, y: number, vx: number, vy: number, duracao: number): Luz => {
    const l: Luz = { tipo, x, y, vx, vy, rumo: sortear(0, Math.PI * 2), velocidade: 0, fase: sortear(0, Math.PI * 2), vida: 0, duracao, ate: 0 };
    luzes.push(l);
    return l;
  };
  const naArea = (a: Area): Ponto => ({ x: sortear(a.x0, a.x1) * largura, y: sortear(a.y0, a.y1) * altura });

  const soltarFolha = (area: Area): void => {
    const { x, y } = naArea(area);
    const profundidade = sortear(0.7, 1.1);
    const passo = (u / 3) * profundidade;
    folhas.push({
      x,
      y,
      vento: sortear(-8, 8) * passo,
      descida: sortear(26, 44) * passo,
      balanco: sortear(8, 16) * passo,
      ritmo: sortear(1.4, 2.4),
      fase: sortear(0, Math.PI * 2),
      giro: sortear(0, Math.PI * 2),
      rodopio: Math.random() < 0.5 ? sortear(2, 5) * (Math.random() < 0.5 ? -1 : 1) : sortear(-0.6, 0.6),
      vida: 0,
      desenho: folhaPronta(escolher(VERDES), Math.random() < 0.7 ? 'pequena' : 'media'),
      profundidade,
    });
  };

  // Tudo o que nasce neste quadro.
  const soltar = (dt: number): void => {
    MUSGOS.forEach((area, i) => {
      acumulado.folhas[i] += FOLHAS_POR_SEGUNDO * dt;
      for (; acumulado.folhas[i] >= 1; acumulado.folhas[i]--) soltarFolha(area);
    });
    QUEDAS.forEach((q, i) => {
      acumulado.fios[i] += 16 * (q.x1 - q.x0) * 40 * dt;
      for (; acumulado.fios[i] >= 1; acumulado.fios[i]--) {
        const l = nova('fio', sortear(q.x0, q.x1) * largura, q.y0 * altura, 0, sortear(28, 40) * u, 1);
        l.ate = q.y1 * altura;
      }
    });
    PES_DAS_QUEDAS.forEach((pe, i) => {
      acumulado.espuma[i] += 16 * dt;
      for (; acumulado.espuma[i] >= 1; acumulado.espuma[i]--) {
        nova('espuma', (pe.x + sortear(-pe.largura, pe.largura) / 2) * largura, pe.y * altura, sortear(-5, 5) * u, -sortear(4, 11) * u, sortear(0.5, 1));
      }
    });
    acumulado.brilhos += 6 * dt;
    for (; acumulado.brilhos >= 1; acumulado.brilhos--) {
      const { x, y } = naArea(LAGO);
      nova('brilho', x, y, sortear(1, 3) * u, 0, sortear(0.6, 1.3));
    }
    acumulado.gotas += 1.6 * dt;
    for (; acumulado.gotas >= 1; acumulado.gotas--) {
      const ponta = escolher(PONTAS_DO_TETO);
      const l = nova('gota', ponta.x * largura + sortear(-1, 1) * u, ponta.y * altura, 0, 0, 3);
      l.ate = Math.min(0.9, ponta.y + sortear(0.2, 0.4)) * altura;
    }
    if (luzes.filter((l) => l.tipo === 'poeira').length < POEIRA && Math.random() < dt * 8) {
      const { x, y } = naArea(LUZ_DA_LUA);
      nova('poeira', x, y, 0, 0, sortear(5, 9)).velocidade = sortear(1.5, 4) * u;
    }
    if (luzes.filter((l) => l.tipo === 'vagalume').length < VAGALUMES && Math.random() < dt * 2.5) {
      nova('vagalume', sortear(0.03, 0.97) * largura, sortear(0.4, 0.9) * altura, 0, 0, sortear(6, 10)).velocidade = sortear(4, 8) * u;
    }
  };

  const atualizar = (dt: number): void => {
    for (const f of folhas) cair(f, dt, 1);
    folhas = folhas.filter((f) => f.y < altura + u * 10 && f.vida < 12);
    for (const l of luzes) {
      l.vida += dt;
      if (l.tipo === 'vagalume' || l.tipo === 'poeira') {
        // Vagueiam: o rumo vira devagar para um lado e para o outro; a poeira desce devagar.
        l.rumo += Math.sin(l.vida * (l.tipo === 'vagalume' ? 1.3 : 0.6) + l.fase) * dt * 1.6;
        l.x += Math.cos(l.rumo) * l.velocidade * dt;
        l.y += (Math.sin(l.rumo) * l.velocidade * 0.6 + (l.tipo === 'poeira' ? 0.8 * u : 0)) * dt;
        continue;
      }
      if (l.tipo === 'gota') {
        // Fica um pouco pendurada na ponta, crescendo, e cai.
        if (l.vida > 0.6) l.vy += 120 * u * dt;
        if (l.y >= l.ate) l.vida = l.duracao;
      }
      if (l.tipo === 'fio' && l.y >= l.ate) l.vida = l.duracao;
      if (l.tipo === 'espuma') l.vy += 12 * u * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
    }
    luzes = luzes.filter((l) => l.vida < l.duracao);
  };

  // Os pedaços por cima da arte, em faixas: cada faixa deslocada para o lado pela onda.
  const mexer = (c: CanvasRenderingContext2D): void => {
    for (const { pedaco, canvas } of recortes) {
      const { x0, x1, y0, y1 } = pedaco.area;
      const { forca, ritmo, passo, desce } = pedaco.onda;
      const dx = x0 * largura;
      const dy = y0 * altura;
      const escalaX = ((x1 - x0) * largura) / canvas.width;
      const escalaY = ((y1 - y0) * altura) / canvas.height;
      for (let y = 0; y < canvas.height; y += FAIXA) {
        const h = Math.min(FAIXA, canvas.height - y);
        const f = y / canvas.height;
        const forcaAqui = forca * Math.max(0, desce >= 0 ? 1 - desce + desce * f : 1 + desce * f);
        const desvio = Math.sin(tempo * ritmo - y * passo) * forcaAqui * escalaX;
        c.drawImage(canvas, 0, y, canvas.width, h, Math.round(dx + desvio), Math.round(dy + y * escalaY), canvas.width * escalaX, Math.ceil(h * escalaY));
      }
    }
  };

  // O meio do fogo de cada tocha e o cristal da logo, na tela da caverna (null: escondido).
  const ondeEsta = (alvo: HTMLElement, p: Ponto, caixa: DOMRect): Ponto | null => {
    const r = alvo.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.left - caixa.left + r.width * p.x, y: r.top - caixa.top + r.height * p.y };
  };

  // Um buraco de luz na escuridão (ou uma mancha de cor, nas luzes): o gradiente redondo, mais
  // alto que largo quando `esticar` > 1.
  const mancha = (c: CanvasRenderingContext2D, p: Ponto, raio: number, cor: [number, number, number], forca: number, esticar = 1): void => {
    if (forca <= 0) return;
    const [r, g, b] = cor;
    c.save();
    c.translate(p.x, p.y);
    c.scale(1, esticar);
    const grad = c.createRadialGradient(0, 0, 0, 0, 0, raio);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${forca})`);
    grad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${forca * 0.78})`);
    grad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, ${forca * 0.3})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    c.fillStyle = grad;
    c.fillRect(-raio, -raio, raio * 2, raio * 2);
    c.restore();
  };

  const desenhar = (escurecer: number): void => {
    const movendo = !semMovimento();
    // A arte viva: os pedaços que mexem e as folhas.
    const v = contexto2d(vida);
    v.clearRect(0, 0, largura, altura);
    if (movendo) {
      v.imageSmoothingEnabled = true;
      mexer(v);
      v.imageSmoothingEnabled = false;
      for (const f of folhas) {
        desenharFolha(v, f.desenho, f.x, f.y, Math.max(2, u * 0.7) * f.profundidade, inclinacao(f), f.giro, Math.min(1, f.vida * 4));
      }
      v.globalAlpha = 1;
    }

    // As luzes: onde estão agora e quão fortes.
    const caixa = el.getBoundingClientRect();
    const fogos = tochas
      .map((t) => ({ onde: ondeEsta(t.fogo, MEIO_DO_FOGO, caixa), forca: t.forca() }))
      .filter((f): f is { onde: Ponto; forca: number } => f.onde !== null);
    const cristal = ondeEsta(logo, CRISTAL, caixa);
    const pulso = 0.82 + 0.18 * Math.sin(tempo * 1.7);
    const boca = fracao(BOCA);
    const cachoeira = fracao(CACHOEIRA);

    // A escuridão, com os buracos das luzes.
    const e = contexto2d(escuro);
    e.clearRect(0, 0, largura, altura);
    if (escurecer > 0) {
      e.globalCompositeOperation = 'source-over';
      // Mais fechada nas beiradas da tela, como o fundo de uma caverna.
      const fundo = e.createRadialGradient(largura / 2, altura * 0.55, altura * 0.2, largura / 2, altura * 0.55, largura * 0.62);
      fundo.addColorStop(0, `rgba(3, 5, 12, ${(ESCURIDAO * 0.9 * escurecer).toFixed(3)})`);
      fundo.addColorStop(1, `rgba(3, 5, 12, ${(Math.min(0.97, ESCURIDAO * 1.07) * escurecer).toFixed(3)})`);
      e.fillStyle = fundo;
      e.fillRect(0, 0, largura, altura);
      e.globalCompositeOperation = 'destination-out';
      for (const f of fogos) {
        mancha(e, f.onde, altura * 0.52, [0, 0, 0], 0.97 * f.forca, 1.35);
        // E o chão em volta do pé da tocha, que o fogo alcança de cima.
        mancha(e, { x: f.onde.x, y: altura * 0.97 }, altura * 0.2, [0, 0, 0], 0.5 * f.forca, 0.7);
      }
      if (cristal) mancha(e, cristal, altura * 0.3, [0, 0, 0], 0.85 * pulso);
      mancha(e, boca, altura * 0.2, [0, 0, 0], 0.55);
      mancha(e, cachoeira, altura * 0.15, [0, 0, 0], 0.4);
      for (const c of COGUMELOS) mancha(e, fracao(c), altura * 0.04, [0, 0, 0], 0.4);
      e.globalCompositeOperation = 'source-over';
    }

    // A cor das luzes, somando luz por cima de tudo: o laranja das tochas, o dourado do cristal,
    // o azul da lua e o vermelho fraco dos cogumelos.
    const k = contexto2d(cores);
    k.clearRect(0, 0, largura, altura);
    for (const f of fogos) mancha(k, f.onde, altura * 0.45, [255, 140, 50], 0.42 * f.forca * escurecer, 1.35);
    if (cristal) mancha(k, cristal, altura * 0.28, [255, 196, 80], 0.5 * pulso * escurecer);
    mancha(k, boca, altura * 0.24, [90, 140, 255], 0.16 * escurecer);
    for (const c of COGUMELOS) mancha(k, fracao(c), altura * 0.03, [255, 90, 40], 0.18 * (0.8 + 0.2 * Math.sin(tempo * 2 + c.x * 40)) * escurecer);

    // A luz na logo, na medida dela (as luzes em volta, levadas para a caixa da logo).
    const r = logo.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const lw = Math.round(r.width);
      const lh = Math.round(r.height);
      for (const c of [sombraDaLogo, corDaLogo]) {
        if (c.width !== lw || c.height !== lh) {
          c.width = lw;
          c.height = lh;
        }
      }
      const ox = r.left - caixa.left;
      const oy = r.top - caixa.top;
      const naLogo = (pt: Ponto): Ponto => ({ x: pt.x - ox, y: pt.y - oy });
      const meioDoCristal = { x: lw * CRISTAL.x, y: lh * CRISTAL.y };
      // A luz de cada tocha bate na logo de baixo, do lado dela: o centro fica logo abaixo da
      // borda de baixo, puxado para o lado da tocha (a da esquerda acende a metade esquerda e
      // tremula com o fogo dela; a da direita, a outra).
      const deBaixo = (fogo: Ponto): Ponto => {
        const p = naLogo(fogo);
        return { x: Math.max(lw * 0.05, Math.min(lw * 0.95, p.x)), y: lh * 1.08 };
      };
      // A sombra: a logo escurece com a caverna, menos perto do cristal e do lado das tochas.
      const s = contexto2d(sombraDaLogo);
      s.clearRect(0, 0, lw, lh);
      if (escurecer > 0) {
        s.globalCompositeOperation = 'source-over';
        s.fillStyle = `rgba(4, 6, 14, ${(0.55 * escurecer).toFixed(3)})`;
        s.fillRect(0, 0, lw, lh);
        s.globalCompositeOperation = 'destination-out';
        mancha(s, meioDoCristal, lh * 0.6, [0, 0, 0], 0.9 * pulso);
        for (const f of fogos) mancha(s, deBaixo(f.onde), lw * 0.78, [0, 0, 0], 0.85 * f.forca, 0.9);
        s.globalCompositeOperation = 'source-over';
      }
      // A cor: dourado do cristal no alto, laranja das tochas nas beiradas, azul da lua.
      const k2 = contexto2d(corDaLogo);
      k2.clearRect(0, 0, lw, lh);
      if (escurecer > 0) {
        mancha(k2, meioDoCristal, lh * 0.5, [255, 196, 80], 0.5 * pulso * escurecer);
        for (const f of fogos) mancha(k2, deBaixo(f.onde), lw * 0.78, [255, 138, 46], 0.95 * f.forca * escurecer, 0.9);
        const lua = naLogo(boca);
        mancha(k2, lua, Math.hypot(lua.x - lw / 2, lua.y - lh / 2) * 1.1, [90, 140, 255], 0.14 * escurecer);
        // De tempos em tempos, um brilho de quatro pontas na ponta do cristal.
        if (brilhoDoCristal > 0) {
          const q = Math.max(2, Math.round(lh / 90));
          desenharBrilho(k2, meioDoCristal.x, lh * 0.04, q, brilhoDoCristal, '#fff6d0', escurecer);
          k2.globalAlpha = 1;
        }
      }
    }

    // Os pontos de luz, por cima da escuridão.
    const p = contexto2d(pontos);
    p.clearRect(0, 0, largura, altura);
    // O brilho do próprio cristal, por trás da logo: dourado, pulsando, com o miolo claro.
    if (cristal) {
      desenharHalo(p, '#ffc93c', cristal.x, cristal.y, altura * 0.09 * (0.95 + 0.1 * pulso), (0.35 + 0.35 * pulso) * escurecer);
      desenharHalo(p, '#fff3c4', cristal.x, cristal.y, altura * 0.035, (0.3 + 0.3 * pulso) * escurecer);
    }
    if (!movendo) {
      p.globalAlpha = 1;
      return;
    }
    const q = Math.max(2, Math.round(u * 0.6)); // um pixel das luzes
    for (const l of luzes) {
      const t = l.vida / l.duracao;
      const entra = Math.min(1, t * 5) * Math.min(1, (1 - t) * 4);
      const { x, y } = paraTela(l.x, l.y);
      if (l.tipo === 'vagalume') {
        // Acende e apaga devagar.
        const acende = Math.max(0, Math.sin(tempo * 1.7 + l.fase)) ** 2;
        const a = entra * (0.15 + 0.85 * acende);
        desenharHalo(p, '#c8f25a', x, y, q * 5.5, a * 0.45);
        desenharHalo(p, '#f4ffc0', x, y, q * 2, a * 0.6);
        p.globalAlpha = a;
        p.fillStyle = '#fbffe0';
        p.fillRect(Math.round(x - q / 2), Math.round(y - q / 2), q, q);
      } else if (l.tipo === 'poeira') {
        const a = entra * (0.4 + 0.3 * Math.sin(tempo * 2.4 + l.fase));
        desenharHalo(p, '#a9c8ff', x, y, q * 2.5, a * 0.3);
        p.globalAlpha = a;
        p.fillStyle = '#e4efff';
        p.fillRect(Math.round(x - q / 4), Math.round(y - q / 4), Math.max(1, q / 2), Math.max(1, q / 2));
      } else if (l.tipo === 'fio') {
        // Um risco claro descendo pela cachoeira.
        p.globalAlpha = 0.45 * Math.min(1, t * 6);
        p.fillStyle = '#d6ecff';
        p.fillRect(Math.round(x), Math.round(y), Math.max(1, q / 2), q * 3);
      } else if (l.tipo === 'espuma') {
        p.globalAlpha = entra * 0.75;
        p.fillStyle = '#e6f4ff';
        p.fillRect(Math.round(x - q / 2), Math.round(y - q / 2), q, q);
      } else if (l.tipo === 'gota') {
        // Pendurada, cresce na ponta; caindo, um risquinho com um brilho.
        const pendurada = l.vida < 0.6;
        const a = pendurada ? l.vida / 0.6 : 1;
        desenharHalo(p, '#9cc4ff', x, y, q * 2, a * 0.25);
        p.globalAlpha = 0.85 * a;
        p.fillStyle = '#cfe4ff';
        p.fillRect(Math.round(x - q / 4), Math.round(y), Math.max(1, q / 2), pendurada ? q : q * 2);
      } else {
        // O brilho da luz no lago: um risquinho que acende e apaga.
        const a = entra * Math.max(0, Math.sin(t * Math.PI));
        desenharHalo(p, '#9cc4ff', x, y, q * 3, a * 0.3);
        p.globalAlpha = a * 0.9;
        p.fillStyle = '#e4f0ff';
        p.fillRect(Math.round(x - q), Math.round(y - q / 4), q * 2, Math.max(1, Math.round(q / 2)));
      }
    }
    p.globalAlpha = 1;
  };

  return {
    el,
    quadro(dt) {
      if (!el.isConnected) {
        vigia.abort();
        return;
      }
      medir();
      if (largura === 0 || altura === 0) return;
      tempo += dt;
      if (!semMovimento()) {
        proximoBrilho -= dt;
        brilhoDoCristal = Math.max(0, brilhoDoCristal - dt * 1.6);
        if (proximoBrilho <= 0) {
          proximoBrilho = sortear(3, 6);
          brilhoDoCristal = 1;
        }
        soltar(dt);
        atualizar(dt);
        const k = 1 - Math.exp(-SEGUE * dt);
        paralaxe.x += (-mouse.x * PARALAXE - paralaxe.x) * k;
        paralaxe.y += (-mouse.y * PARALAXE - paralaxe.y) * k;
        escala = 1.04 + 0.012 * Math.sin((tempo * Math.PI * 2) / 26);
      }
      arte.style.transform = `translate(${(paralaxe.x * largura).toFixed(2)}px, ${(paralaxe.y * altura).toFixed(2)}px) scale(${escala.toFixed(4)})`;
      desenhar(semMovimento() ? 1 : suave((tempo - ESCURECE_EM) / ESCURECE_POR));
    },
  };
}
