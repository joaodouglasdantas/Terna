"""Prepara a arte de fundo dos menus (a floresta ao pôr do sol) para o jogo.

Uso (na pasta jogo/):  python3 ferramentas/tela-inicial.py   (precisa do opencv-contrib: cv2.xphoto)

Lê fontes/tela-inicial.png (a arte original, 1672x940) e grava:
- apps/cliente/src/assets/tela-inicial.webp: a arte sem o que o jogo anima por cima dela (os
  pássaros parados no céu, as folhas soltas no ar e os vagalumes acesos), que viraria cópia
  parada do que se mexe. Cada um é apagado e preenchido com pedaços da própria arte em volta.
- apps/cliente/src/assets/tela-inicial-arvores.png: a máscara das árvores grandes das beiradas
  (branco onde é árvore, transparente no céu), para os pássaros que o jogo desenha passarem por
  trás delas (inicio/cena.ts) — com a borda clara do tronco (com_casca).

Só a máscara: python3 ferramentas/tela-inicial.py arvores  (não mexe na arte).

Depois dele, rode npm run arte:tela-inicial-feixes (ferramentas/tela-inicial-sem-feixes.cjs): tira do
céu da arte gravada os feixes de luz parados, que brigavam com os raios da logo.
"""
import os
import sys
import cv2
import numpy as np

RAIZ = os.path.join(os.path.dirname(__file__), '..')
FONTE = os.path.join(RAIZ, 'fontes', 'tela-inicial.png')
ASSETS = os.path.join(RAIZ, 'apps', 'cliente', 'src', 'assets')

# Os pássaros parados: a caixa deles no céu (só os pixels escuros saem).
PASSAROS = (1088, 222, 1180, 288)
# As folhas soltas no ar: caixas.
FOLHAS = [(312, 322, 350, 352), (1402, 418, 1440, 448), (1222, 730, 1256, 760)]
# Os vagalumes acesos (o brilho em volta): centro e raio.
VAGALUMES = [(263, 486, 13), (528, 543, 14), (352, 625, 12), (479, 627, 14), (395, 707, 14), (189, 617, 10),
             (242, 631, 8), (1310, 538, 13), (1443, 669, 14), (1468, 689, 11), (1619, 841, 11), (688, 779, 10)]
# As árvores das beiradas vão até esta altura (os pássaros voam acima dela).
ALTURA_DAS_COPAS = 360


def preencher(img, mascara, folga=40):
    """Preenche a máscara com pedaços da arte em volta (shift-map), recorte a recorte."""
    n, rotulos, caixas, _ = cv2.connectedComponentsWithStats(mascara)
    for i in range(1, n):
        x, y, w, h, _ = caixas[i]
        x0, y0 = max(0, x - folga), max(0, y - folga)
        x1, y1 = min(img.shape[1], x + w + folga), min(img.shape[0], y + h + folga)
        pedaco = img[y0:y1, x0:x1]
        m = (rotulos[y0:y1, x0:x1] == i).astype(np.uint8)
        lab = cv2.cvtColor(pedaco, cv2.COLOR_BGR2Lab)
        saida = np.zeros_like(lab)
        cv2.xphoto.inpaint(lab, (m == 0).astype(np.uint8), saida, cv2.xphoto.INPAINT_SHIFTMAP)
        pronto = cv2.cvtColor(saida, cv2.COLOR_Lab2BGR)
        pedaco[m > 0] = pronto[m > 0]


def limpar(img):
    mascara = np.zeros(img.shape[:2], np.uint8)
    x0, y0, x1, y1 = PASSAROS
    caixa = img[y0:y1, x0:x1]
    escuro = (cv2.cvtColor(caixa, cv2.COLOR_BGR2GRAY) < 95).astype(np.uint8) * 255
    mascara[y0:y1, x0:x1] = cv2.dilate(escuro, np.ones((5, 5), np.uint8))
    for x0, y0, x1, y1 in FOLHAS:
        caixa = img[y0:y1, x0:x1].astype(int)
        b, g, r = caixa[:, :, 0], caixa[:, :, 1], caixa[:, :, 2]
        verde = ((g > b + 10) & (g > r - 10)).astype(np.uint8) | (cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY) < 40).astype(np.uint8)
        mascara[y0:y1, x0:x1] = cv2.dilate(verde * 255, np.ones((5, 5), np.uint8))
    for x, y, r in VAGALUMES:
        cv2.circle(mascara, (x, y), r, 255, -1)
    preencher(img, mascara)
    return img


def arvores(img):
    """Branco onde é árvore das beiradas: nem céu (azul, roxo, rosa) nem nuvem alaranjada clara."""
    b, g, r = [img[:, :, i].astype(int) for i in range(3)]
    ceu = (b > g + 8) | ((r > 170) & (r > g + 35)) | ((r + g + b) > 560)
    arvore = (~ceu).astype(np.uint8)
    arvore[ALTURA_DAS_COPAS:] = 0
    arvore = cv2.morphologyEx(arvore, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    arvore = cv2.morphologyEx(arvore, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    # Só as árvores das beiradas: os pedaços grandes que encostam no lado do quadro.
    n, rotulos, caixas, _ = cv2.connectedComponentsWithStats(arvore)
    fica = np.zeros_like(arvore)
    for i in range(1, n):
        x, y, w, h, area = caixas[i]
        if area > 400 and (x == 0 or x + w >= img.shape[1] - 1 or y == 0):
            fica[rotulos == i] = 1
    fica = com_casca(img, fica > 0)
    rgba = np.zeros((*img.shape[:2], 4), np.uint8)
    rgba[fica] = (255, 255, 255, 255)
    return rgba


def com_casca(img, arvore):
    """A borda clara do tronco (laranja e amarelo, onde bate o sol) entra na árvore: o teste do
    céu acima a tomava por nuvem, e o pássaro passava por cima dela, parecendo entrar no tronco.
    Casca é quente e quase sem azul (as nuvens têm bem mais azul); o meio-tom entre ela e o céu
    também entra, mas só no pedaço que tem casca de verdade e encosta na árvore. No fim, os
    buraquinhos de céu de poucos pixels dentro da árvore são tapados."""
    b, g, r = [img[:, :, i].astype(int) for i in range(3)]
    casca = (b < 85) & (r > b + 60) & ~arvore
    meio = (b < 115) & (r > 150) & (r > b + 70) & ~arvore
    casca[ALTURA_DAS_COPAS:] = False
    meio[ALTURA_DAS_COPAS:] = False
    candidata = (casca | meio).astype(np.uint8)
    _, rotulos = cv2.connectedComponents(candidata, connectivity=8)
    encosta = cv2.dilate(arvore.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    nova = arvore.copy()
    for i in np.unique(rotulos[encosta & (candidata > 0)]):
        if i == 0:
            continue
        pedaco = rotulos == i
        if (casca & pedaco).sum() >= 0.5 * pedaco.sum():
            nova |= pedaco
    n, rotulos, caixas, _ = cv2.connectedComponentsWithStats((~nova).astype(np.uint8), connectivity=4)
    for i in range(1, n):
        if caixas[i][4] < 60:
            nova[rotulos == i] = True
    return nova


def main():
    img = cv2.imread(FONTE)
    if len(sys.argv) > 1 and sys.argv[1] == 'arvores':
        cv2.imwrite(os.path.join(ASSETS, 'tela-inicial-arvores.png'), arvores(img))
        print('ok (só a máscara)')
        return
    limpa = limpar(img.copy())
    cv2.imwrite(os.path.join(ASSETS, 'tela-inicial.webp'), limpa, [cv2.IMWRITE_WEBP_QUALITY, 88])
    cv2.imwrite(os.path.join(ASSETS, 'tela-inicial-arvores.png'), arvores(img))
    print('ok')


if __name__ == '__main__':
    main()
