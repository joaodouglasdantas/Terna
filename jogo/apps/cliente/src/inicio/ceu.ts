// O céu da tela inicial vivo (desenhado pelo cena.ts, por cima da arte e por baixo dos pássaros):
// - o céu da arte, um pouco mais nítido, com as nuvens de cima apagadas (tela-inicial-ceu.webp);
// - as nuvens de cima andando devagar de um lado para o outro, cada uma no seu ritmo (as mais
//   altas mais devagar), passando por trás das copas e das montanhas (a máscara
//   tela-inicial-ceu-frente.webp corta o que fica na frente delas);
// - as estrelas piscando, as mais fortes com um brilho em cruz de vez em quando.
// Os raios do sol são do CSS (.inicio-cena-raios). Tudo sai de ferramentas/ceu.py.

import urlCeu from '../assets/tela-inicial-ceu.webp';
import urlFrente from '../assets/tela-inicial-ceu-frente.webp';
import urlNuvens from '../assets/tela-inicial-nuvens.webp';
import { carregarDecodificada, contexto2d, novoCanvas, umaVez } from '../motor/imagens';
import { ANDA, ARTE_CEU, CEU_LIMPO, ESTRELAS, NUVENS } from './ceu-dados';
import { desenharBrilho, desenharHalo } from './efeitos';

export const carregarCeu = umaVez(() => Promise.all([carregarDecodificada(urlCeu), carregarDecodificada(urlFrente), carregarDecodificada(urlNuvens)]));

let imagens: [HTMLImageElement, HTMLImageElement, HTMLImageElement] | null = null;
let camada: HTMLCanvasElement | null = null;

// O ritmo de cada nuvem: o período (s) da ida e volta e a fase. As mais altas (mais longe) vão
// mais devagar e andam menos.
const RITMOS = NUVENS.map((n, i) => {
  const longe = 1 - (n.y + n.h / 2) / CEU_LIMPO.h / 1.4;
  return { periodo: 70 + longe * 50 + (i % 3) * 9, fase: i * 1.7, anda: ANDA * (0.65 + 0.35 * (1 - longe)) };
});
// O ritmo de cada estrela.
const PISCAS = ESTRELAS.map((_, i) => ({ ritmo: 1.2 + ((i * 37) % 23) / 10, fase: (i * 2.39) % (Math.PI * 2) }));

// Desenha o céu em `c` (o canvas da cena, `largura` × `altura`, a arte inteira). `parado`: sem
// movimento (a preferência do sistema): as nuvens ficam no lugar e as estrelas não piscam.
export function desenharCeu(c: CanvasRenderingContext2D, largura: number, altura: number, tempo: number, parado: boolean): void {
  if (!imagens) {
    void carregarCeu().then((imgs) => (imagens = imgs), () => undefined);
    return;
  }
  const [ceu, frente, nuvens] = imagens;
  if (!camada) camada = novoCanvas(CEU_LIMPO.w, CEU_LIMPO.h);
  const k = contexto2d(camada);
  k.globalCompositeOperation = 'source-over';
  k.clearRect(0, 0, CEU_LIMPO.w, CEU_LIMPO.h);
  k.drawImage(ceu, 0, 0);
  // As nuvens, no pixel da arte (andam de pixel em pixel).
  NUVENS.forEach((n, i) => {
    const r = RITMOS[i];
    const dx = parado ? 0 : Math.round(Math.sin((tempo / r.periodo) * Math.PI * 2 + r.fase) * r.anda);
    k.drawImage(nuvens, 0, n.ay, n.w, n.h, n.x - CEU_LIMPO.x + dx, n.y - CEU_LIMPO.y, n.w, n.h);
  });
  // O que fica na frente do céu (as copas e as montanhas) corta a camada.
  k.globalCompositeOperation = 'destination-out';
  k.drawImage(frente, 0, 0);
  const ex = largura / ARTE_CEU.largura;
  const ey = altura / ARTE_CEU.altura;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(camada, CEU_LIMPO.x * ex, CEU_LIMPO.y * ey, CEU_LIMPO.w * ex, CEU_LIMPO.h * ey);

  // As estrelas: acendem e apagam devagar, cada uma no seu ritmo.
  const u = Math.max(1, Math.round(ex * 1.4));
  c.globalCompositeOperation = 'lighter';
  ESTRELAS.forEach((e, i) => {
    const p = PISCAS[i];
    const onda = parado ? 0.6 : 0.5 + 0.5 * Math.sin(tempo * p.ritmo + p.fase);
    const a = e.forca * (0.25 + 0.75 * onda * onda);
    const x = e.x * ex;
    const y = e.y * ey;
    desenharHalo(c, '#bcd4ff', x, y, u * (3 + e.forca * 3), a * 0.45);
    c.globalAlpha = Math.min(1, a * 1.1);
    c.fillStyle = '#f4f8ff';
    c.fillRect(Math.round(x - u / 2), Math.round(y - u / 2), u, u);
    // As mais fortes, no alto da piscada, abrem um brilho em cruz.
    if (!parado && e.forca > 0.55 && onda > 0.93) desenharBrilho(c, x, y, u, (onda - 0.93) * 14 * e.forca, '#e8f0ff');
  });
  c.restore();
}
