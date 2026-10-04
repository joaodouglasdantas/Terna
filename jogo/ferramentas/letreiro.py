# O letreiro "TERNA" da placa da tela inicial, em pixel art. A forma das letras vem do desenho da
# fonte da logo (letreiro-forma.png: letras brancas no preto), reduzida para a grade de pixels; sem
# ele, usa as letras de polígonos daqui (LETRAS). Pintado como madeira clara entalhada:
#  - o miolo creme, mais claro em cima e mais escuro embaixo, com uns veios curtos;
#  - um pixel de realce claro na beirada de cima e da esquerda de cada letra;
#  - um contorno marrom-escuro de um pixel, igual em toda a volta;
#  - a sombra do entalhe (um pixel marrom) embaixo e à direita do contorno.
# Devolve a imagem RGBA no pixel lógico (sem ampliar); montar-placa.py amplia e põe no painel.
import numpy as np
from PIL import Image, ImageDraw

ALTURA = 18  # altura da letra, em pixels lógicos
SUPER = 8  # supersample para rasterizar os polígonos sem serrilhado torto

# Cada letra: largura e uma lista de polígonos (x, y) — os que somam e os que furam (buracos).
LETRAS = {
    'T': (16, [
        [(0, 0.6), (16, 0), (16, 4.4), (10.4, 4.4), (10.4, 14.5), (12.2, 18), (3.8, 18), (5.6, 14.5), (5.6, 4.4), (0.8, 4.6)],
    ], []),
    'E': (13, [
        [(0, 0), (13, 0), (12, 4.2), (5, 4.2), (5, 7.2), (10.5, 7.2), (12, 9.2), (10.5, 11.2), (5, 11.2), (5, 13.8), (12, 13.8), (13.4, 18), (0, 18)],
    ], []),
    'R': (14.4, [
        [(0, 0), (10.6, 0), (14, 3), (14, 7.4), (11.4, 10), (14.6, 18), (9.6, 18), (7, 10.6), (5, 10.6), (5, 18), (0, 18)],
    ], [
        [(5, 3.8), (9, 3.8), (9.8, 4.6), (9.8, 6.4), (9, 7.2), (5, 7.2)],
    ]),
    'N': (15, [
        [(0, 0), (5.2, 0), (10, 9.6), (10, 0), (15, 0), (15, 18), (10, 18), (5, 8), (5, 18), (0, 18)],
    ], []),
    'A': (16.4, [
        [(5.4, 0), (11, 0), (16.4, 18), (11.2, 18), (10.3, 14.6), (6.1, 14.6), (5.2, 18), (0, 18)],
    ], [
        [(8.2, 3.8), (10.1, 11), (6.3, 11)],
    ]),
}
ESPACO = 2.4  # entre as letras (cada uma com o seu contorno)
ARCO = 0.2  # quanto as pontas da palavra crescem para baixo (fração da altura)

CREME_CLARO = (252, 238, 210)
CREME = (241, 219, 178)
CREME_ESCURO = (222, 190, 140)
VEIO = (214, 176, 122)
REALCE = (255, 247, 228)
CONTORNO = (52, 24, 12)
SOMBRA = (96, 46, 20)


def mascara_da_palavra(texto: str = 'TERNA') -> np.ndarray:
    larg = sum(LETRAS[c][0] for c in texto) + ESPACO * (len(texto) - 1)
    W = int(np.ceil(larg)) + 1
    H = int(np.ceil(ALTURA * (1 + ARCO))) + 1
    img = Image.new('L', (W * SUPER, H * SUPER), 0)
    d = ImageDraw.Draw(img)
    cx, meia = larg / 2, larg / 2

    def torto(x: float, y: float) -> tuple[float, float]:
        # a base em arco: cada ponto desce conforme a distância do meio (o alto fica reto)
        u = (x - cx) / meia
        return x * SUPER, y * (1 + ARCO * u * u) * SUPER

    def poligono(pts, ox, cor):
        # divide as arestas em pedaços para o arco entortar as retas também
        densos = []
        for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
            for t in np.linspace(0, 1, 12, endpoint=False):
                densos.append(torto(ox + x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
        d.polygon(densos, fill=cor)

    x = 0.0
    for c in texto:
        w, cheios, furos = LETRAS[c]
        for p in cheios:
            poligono(p, x, 255)
        for p in furos:
            poligono(p, x, 0)
        x += w + ESPACO
    peq = np.array(img.resize((W, H), Image.BOX)) > 127
    return peq


def mascara_da_imagem(caminho: str, altura: int) -> np.ndarray:
    # A forma das letras tirada de uma imagem (letras claras num fundo escuro), reduzida para a
    # grade de pixels: cada pixel é letra se mais da metade dele for letra.
    im = np.array(Image.open(caminho).convert('L')) > 128
    ys, xs = np.nonzero(im)
    im = im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    # afina as letras um terço de pixel antes de reduzir: os vãos entre elas não fecham e cada uma
    # fica com o seu contorno
    from scipy import ndimage
    im = ndimage.binary_erosion(im, iterations=max(1, round(im.shape[0] / altura / 3)))
    largura = round(im.shape[1] * altura / im.shape[0])
    peq = Image.fromarray((im * 255).astype(np.uint8)).resize((largura, altura), Image.BOX)
    return np.array(peq) > 127


def letreiro(texto: str = 'TERNA', semente: int = 4, forma: str | None = None, altura: int = 38) -> Image.Image:
    rng = np.random.default_rng(semente)
    m = mascara_da_imagem(forma, altura) if forma else mascara_da_palavra(texto)
    m = np.pad(m, 3)
    H, W = m.shape
    out = np.zeros((H, W, 4), np.uint8)
    ys = np.nonzero(m.any(1))[0]
    topo, base = ys.min(), ys.max()
    # o miolo: creme em três faixas (claro em cima, escuro embaixo, pelo alto de cada coluna)
    for x in range(W):
        col = np.nonzero(m[:, x])[0]
        if not len(col):
            continue
        t0, t1 = col.min(), col.max()
        for y in col:
            t = (y - t0) / max(1, t1 - t0)
            cor = CREME_CLARO if t < 0.28 else CREME if t < 0.72 else CREME_ESCURO
            out[y, x, :3] = cor
            out[y, x, 3] = 255
    # veios curtos (2 a 4 pixels, um tom abaixo), longe das beiradas
    dentro = m.copy()
    dentro[1:] &= m[:-1]; dentro[:-1] &= m[1:]; dentro[:, 1:] &= m[:, :-1]; dentro[:, :-1] &= m[:, 1:]
    for _ in range(int(dentro.sum() * 0.035)):
        yy, xx = np.nonzero(dentro)
        k = rng.integers(len(yy))
        y, x = yy[k], xx[k]
        for j in range(int(rng.integers(2, 5))):
            if x + j < W and dentro[y, x + j]:
                out[y, x + j, :3] = VEIO
    # realce: o pixel de cima e o da esquerda de cada beirada
    acima = np.zeros_like(m); acima[1:] = m[:-1]
    esquerda = np.zeros_like(m); esquerda[:, 1:] = m[:, :-1]
    realce = m & (~acima | ~esquerda)
    out[realce, :3] = REALCE
    # o contorno: um pixel em toda a volta (os 8 vizinhos)
    viz = np.zeros_like(m)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            viz |= np.roll(np.roll(m, dy, 0), dx, 1)
    contorno = viz & ~m
    out[contorno, :3] = CONTORNO
    out[contorno, 3] = 255
    # a sombra do entalhe: embaixo e à direita do contorno
    tudo = m | contorno
    sombra = np.zeros_like(m)
    sombra[1:, :] |= tudo[:-1, :]
    sombra[1:, 1:] |= tudo[:-1, :-1]
    sombra &= ~tudo
    out[sombra, :3] = SOMBRA
    out[sombra, 3] = 230
    return Image.fromarray(out, 'RGBA')


if __name__ == '__main__':
    import os
    im = letreiro(forma=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'letreiro-forma.png'))
    im.save('letreiro.png')
    big = im.resize((im.width * 10, im.height * 10), Image.NEAREST)
    fundo = Image.new('RGBA', big.size, (150, 82, 40, 255))
    fundo.alpha_composite(big)
    fundo.convert('RGB').save('letreiro-prev.png')
    print(im.size)
