// O acabamento da paisagem de fundo, feito uma vez quando ela é carregada (agua.ts a copia para um
// canvas próprio e chama realcarPaisagem antes de guardar as cores de base).
//
// - Montanhas: mais contraste, sombras azul-violeta e neve mais branca, com o relevo marcado — cada
//   pixel é comparado com o de cima à esquerda (de onde vem a luz na arte), e a diferença é
//   aumentada: as cristas, as faces das rochas e as bordas da neve aparecem.
// - Colinas e matas: verdes mais vivos e mais fundos, os de longe um pouco azulados (a distância).
// - A base das montanhas some num véu claro, e a serra fica separada das colinas da frente.
// - As manchas de mato no meio da encosta (verde-azuladas na arte, ilhadas na rocha) viram tons
//   escuros da rampa da serra: com a rocha índigo, o verde-azulado delas destoava.

import { graduarCor, luminancia, misturarPixel, rgb, type Graduacao } from './cor';

const MONTANHA: Graduacao = { saturacao: 1.3, contraste: 1.28, pivo: 0.58, sombraFria: 1, luzQuente: 0.55 };
const VERDE_PERTO: Graduacao = { saturacao: 1.22, contraste: 1.18, pivo: 0.42, sombraFria: 0.75, luzQuente: 0.7 };
const VERDE_LONGE: Graduacao = { saturacao: 1.12, contraste: 1.08, pivo: 0.48, sombraFria: 0.4, luzQuente: 0.4 };
const AGUA: Graduacao = { saturacao: 1.2, contraste: 1.12, pivo: 0.5, luzQuente: 0.3 };

const RELEVO = { forca: 0.9, limite: 30 }; // quanto a diferença para o vizinho de cima é somada
const NEVE = { brilho: [255, 253, 246] };
// A rampa da serra, da sombra funda (índigo) à neve no sol; RAMPA_PESO é quanto a cor vai para ela
// (o resto fica com a cor graduada da arte, que guarda as variações de tom).
const RAMPA_SERRA = ['#34386a', '#454c84', '#5a659e', '#7482ba', '#93a3d4', '#b6c5e9', '#d4dff5', '#edf2fc', '#ffffff'].map(rgb);
const RAMPA_PESO = 0.8;
const MANCHA = { de: 1, ate: 3 }; // degraus da rampa usados nas manchas da encosta (os escuros)
// Bolsas no pé da encosta: pixels azulados (ou verde-água claros) com rocha em pelo menos `lados`
// das 4 direções, a até `alcance` px. A borda de cima da mata distante só tem rocha em cima.
const BOLSA = { alcance: 6, lados: 3, azul: 18 };
const VEU = { cor: [176, 204, 238], forca: 0.34, faixa: 30, alisar: 14 }; // o véu nos últimos `faixa` px da serra
const LONGE = { cor: [120, 170, 205], ate: 0.28 }; // tom de distância das colinas lá no fundo

// A serra é o azul claro da arte (azul acima de SERRA_AZUL); a mata de longe, logo embaixo, já é
// um azul-esverdeado mais escuro. Em cada coluna, a serra vai do topo até o primeiro pixel de mata.
const SERRA_AZUL = 168;
const eSerra = (b: number): boolean => b >= SERRA_AZUL;
const SERRA_ATE = 0.58;

export function realcarPaisagem(imagem: ImageData): void {
  const { data, width: w, height: h } = imagem;
  const original = Float32Array.from({ length: w * h }, (_, p) => luminancia(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]));
  const opaco = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 0;

  // Onde a serra acaba em cada coluna (o primeiro pixel de mata embaixo dela).
  const verde = new Int32Array(w).fill(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] && !eSerra(data[i + 2])) {
        verde[x] = y;
        break;
      }
    }
  }
  // Uma coluna fora do comum (a cascata clara descendo até o vale, uma fenda escura na rocha) é
  // acertada pela mediana das vizinhas.
  const pe0 = Int32Array.from(verde, (_, x) => {
    const vizinhas = Array.from(verde.subarray(Math.max(0, x - 12), x + 13)).sort((a, b) => a - b);
    return vizinhas[vizinhas.length >> 1];
  });
  verde.set(pe0);
  // (A serra fica toda acima de SERRA_ATE da altura; embaixo, o mesmo azul é o rio.)
  const serra = (_x: number, y: number, i: number): boolean => y < h * SERRA_ATE && eSerra(data[i + 2]);
  // Para o véu, a borda da mata alisada (média das colunas vizinhas): as pontas dos pinheiros não
  // viram listras verticais na serra.
  const pe = Float32Array.from(verde, (_, x) => {
    let soma = 0;
    let n = 0;
    for (let v = Math.max(0, x - VEU.alisar); v <= Math.min(w - 1, x + VEU.alisar); v++, n++) soma += verde[v];
    return soma / n;
  });

  // Manchas na encosta: o que não é rocha e fica ilhado nela. A mata da frente se liga (pixel a
  // pixel, sem pular diagonais) à linha de baixo da serra; o que sobra sem se ligar está no meio da
  // rocha. As pontas dos pinheiros continuam sendo mata.
  const limite = Math.ceil(h * SERRA_ATE);
  const naoRocha = (p: number): boolean => data[p * 4 + 3] > 0 && !eSerra(data[p * 4 + 2]);
  const mata = new Uint8Array(w * h);
  const fila: number[] = [];
  for (let x = 0; x < w; x++) {
    const p = (limite - 1) * w + x;
    if (naoRocha(p)) {
      mata[p] = 1;
      fila.push(p);
    }
  }
  while (fila.length) {
    const p = fila.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < limite - 1 ? p + w : -1]) {
      if (q >= 0 && !mata[q] && naoRocha(q)) {
        mata[q] = 1;
        fila.push(q);
      }
    }
  }
  const rocha = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < limite && data[(y * w + x) * 4 + 3] > 0 && eSerra(data[(y * w + x) * 4 + 2]);
  const bolsa = (p: number): boolean => {
    const i = p * 4;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (!(b - g >= BOLSA.azul || (b - g > -8 && luminancia(r, g, b) > 110))) return false;
    const x = p % w;
    const y = (p / w) | 0;
    let lados = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let k = 1; k <= BOLSA.alcance; k++) {
        if (rocha(x + dx * k, y + dy * k)) {
          lados++;
          break;
        }
      }
    }
    return lados >= BOLSA.lados;
  };
  const mancha = (p: number): boolean => p < limite * w && naoRocha(p) && (!mata[p] || bolsa(p));
  // Os brilhos das manchas, em ordem, para espalhar os degraus escuros entre elas.
  const brilhosMancha: number[] = [];
  for (let p = 0; p < limite * w; p++) if (mancha(p)) brilhosMancha.push(original[p]);
  brilhosMancha.sort((a, b) => a - b);

  // Brilho de cada pixel da serra com o relevo: a luz vem de cima à esquerda, então a diferença
  // para aquele vizinho marca as cristas, as faces e as bordas da neve.
  const relevo = new Float32Array(w * h);
  const brilhos: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!data[p * 4 + 3] || !serra(x, y, p * 4)) continue;
      const vizinho = opaco(x - 1, y - 1) ? original[p - w - 1] : original[p];
      relevo[p] = original[p] + Math.max(-RELEVO.limite, Math.min(RELEVO.limite, (original[p] - vizinho) * RELEVO.forca));
      brilhos.push(relevo[p]);
    }
  }
  brilhos.sort((a, b) => a - b);
  // Fração dos valores de `lista` (em ordem) abaixo de `v` (0–1).
  const acumulado = (v: number, lista = brilhos): number => {
    let [a, b] = [0, lista.length];
    while (a < b) {
      const m = (a + b) >> 1;
      if (lista[m] < v) a = m + 1;
      else b = m;
    }
    return a / Math.max(1, lista.length - 1);
  };
  // O véu no pé da serra, para a rocha e as manchas nela.
  const veu = (x: number, y: number, i: number): void => {
    const falta = Math.max(0, pe[x] - y);
    if (falta < VEU.faixa) misturarPixel(data, i, VEU.cor, VEU.forca * (1 - falta / VEU.faixa) ** 1.5);
  };

  const cor = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!data[i + 3]) continue;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const naSerra = serra(x, y, i);
      const agua = b > r + 50 && b > g + 20 && y > h * 0.55;

      if (naSerra) {
        // O brilho da arte (com o relevo somado) vira um degrau da rampa, pela posição dele entre
        // todos os brilhos da serra: a serra inteira usa a rampa toda, da sombra funda à neve.
        const p = y * w + x;
        const u = Math.max(0, Math.min(1, acumulado(relevo[p])));
        const alvo = RAMPA_SERRA[Math.round(u * (RAMPA_SERRA.length - 1))];
        graduarCor(r, g, b, MONTANHA, cor);
        data[i] = cor[0] + (alvo[0] - cor[0]) * RAMPA_PESO;
        data[i + 1] = cor[1] + (alvo[1] - cor[1]) * RAMPA_PESO;
        data[i + 2] = cor[2] + (alvo[2] - cor[2]) * RAMPA_PESO;
        // A borda de cima da neve pega o sol.
        if (u > 0.8 && (!opaco(x, y - 1) || original[p - w] < original[p] - 18)) misturarPixel(data, i, NEVE.brilho, 0.7);
        veu(x, y, i);
        continue;
      }

      if (mancha(y * w + x)) {
        const u = acumulado(original[y * w + x], brilhosMancha);
        const alvo = RAMPA_SERRA[Math.round(MANCHA.de + u * (MANCHA.ate - MANCHA.de))];
        data[i] = alvo[0];
        data[i + 1] = alvo[1];
        data[i + 2] = alvo[2];
        veu(x, y, i);
        continue;
      }

      if (agua) {
        graduarCor(r, g, b, AGUA, cor);
        data[i] = cor[0];
        data[i + 1] = cor[1];
        data[i + 2] = cor[2];
        continue;
      }

      // Verde: perto (embaixo) mais fundo e vivo, longe (em cima) mais claro e azulado.
      const longe = Math.max(0, Math.min(1, 1 - (y - h * 0.48) / (h * 0.3)));
      graduarCor(r, g, b, longe > 0.5 ? VERDE_LONGE : VERDE_PERTO, cor);
      data[i] = cor[0];
      data[i + 1] = cor[1];
      data[i + 2] = cor[2];
      if (longe > 0) misturarPixel(data, i, LONGE.cor, LONGE.ate * longe * longe);
    }
  }
}
