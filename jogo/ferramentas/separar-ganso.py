"""Separa a Margo e o ganso da folha dela (fontes/margo-folha.png, já sem o xadrez do fundo por
ferramentas/tirar-fundo.cjs --xadrez-com-branco). A folha desenhou o ganso do lado dela em cada
quadro, encostado nela em muitos (na corrida, ele passa na frente do pé de trás); no jogo, o ganso é
outro corpo, que segue a Margo e, na ult, sai correndo atrás do outro. Grava fontes/margo.png (só
ela) e fontes/ganso.png (só o ganso), as folhas que ferramentas/gerar-herois.cjs lê.

Uso (na pasta jogo/):  python3 ferramentas/separar-ganso.py      (precisa de numpy, scipy e scikit-image)

Como separa, quadro a quadro: o alto do quadro (até ~40% da altura) é só a Margo — o ganso bate na
cintura dela; embaixo, do lado em que o ganso está, os pixels do branco-creme dele e do laranja do
bico e dos pés são dele. A partir dessas sementes, o resto do desenho é dividido pelas bordas (onde a
cor muda forte: o contorno entre os dois), como água subindo de cada lado (watershed). Pedacinhos
soltos que ficaram do lado errado vão para quem os cerca.
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.filters import sobel
from skimage.segmentation import watershed

RAIZ = os.path.join(os.path.dirname(__file__), '..')
FONTE = os.path.join(RAIZ, 'fontes', 'margo-folha.png')

# Os blocos da folha: as fileiras (o ganso à esquerda dela) e as colunas de direção — ESQUERDA e
# FRENTE com o ganso à direita, DIREITA e COSTAS à esquerda. (de, até) em y; o x das colunas.
FILEIRAS = [(38, 144), (152, 258), (267, 364), (373, 494), (515, 630), (635, 736), (735, 826), (828, 922), (924, 1004)]
COLUNAS = {'esquerda': ((905, 1010), 1), 'frente': ((1055, 1162), 1), 'direita': ((1165, 1270), -1), 'costas': ((1312, 1415), -1)}
LINHAS_DAS_COLUNAS = [(92, 206), (210, 322), (324, 437), (442, 556), (560, 678), (680, 790), (790, 896)]
ALTO_SO_DELA = 0.42  # a parte de cima do quadro onde só há a Margo (e o azul do vestido, onde estiver)
BAIXO_DO_GANSO = 0.52  # o ganso fica abaixo disto
LADO_DO_GANSO = 0.36  # e nesta parte da largura, do lado dele


def opacos(img):
    return img[:, :, 3] >= 128


def do_ganso(rgb):
    """O branco-creme das penas e o laranja do bico e dos pés (a pele dela é mais rosada)."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    creme = (np.minimum(np.minimum(r, g), b) > 185) & (r - b < 40)
    laranja = (r > 180) & (g > 90) & (g < 175) & (b < 95)
    return creme | laranja


def do_vestido(rgb):
    """O azul do vestido e do avental dela."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    return (b > r + 25) & (b > 80)


def separar_quadro(img, mascara, rotulos, y0, y1, x0, x1, lado=0, alto=ALTO_SO_DELA, baixo=BAIXO_DO_GANSO):
    """Divide o quadro (a caixa y0:y1, x0:x1) entre a Margo (1) e o ganso (2). `lado`: -1 o ganso
    à esquerda, 1 à direita, 0 o lado com mais branco-creme embaixo (na fileira do ataque ele muda
    de lado no meio). `alto`: a parte de cima que é só dela; `baixo`: o ganso fica abaixo disto."""
    caixa = mascara[y0:y1, x0:x1]
    if not caixa.any():
        return
    ys, xs = np.nonzero(caixa)
    top, bot = ys.min(), ys.max() + 1
    esq, dir_ = xs.min(), xs.max() + 1
    h, w = bot - top, dir_ - esq
    rgb = img[y0:y1, x0:x1, :3]
    sementes = np.zeros(caixa.shape, np.int32)
    yy, xx = np.mgrid[0:caixa.shape[0], 0:caixa.shape[1]]
    # Dela: o alto do quadro e o azul do vestido (o ganso não tem azul nenhum).
    sementes[caixa & ((yy < top + alto * h) | do_vestido(rgb))] = 1
    embaixo = caixa & (yy > top + baixo * h) & do_ganso(rgb)
    na_esquerda = xx < esq + LADO_DO_GANSO * w
    na_direita = xx >= dir_ - LADO_DO_GANSO * w
    if lado == 0:
        lado = -1 if (embaixo & na_esquerda).sum() >= (embaixo & na_direita).sum() else 1
    ganso = embaixo & (na_esquerda if lado < 0 else na_direita)
    # Só o pedaço grande de cor do ganso (um brilho da roupa dela não vira semente).
    lab, n = ndimage.label(ganso, structure=np.ones((3, 3)))
    if n:
        tamanhos = ndimage.sum(ganso, lab, range(1, n + 1))
        sementes[lab == (1 + int(np.argmax(tamanhos)))] = 2
    lum = rgb.astype(float) @ [0.3, 0.59, 0.11]
    relevo = sobel(lum)
    # Sem nada do azul dela (o ganso sozinho, no fim da fileira DIE), é tudo dele.
    parte = watershed(relevo, sementes, mask=caixa) if (caixa & do_vestido(rgb)).any() else np.where(caixa, 2, 0)
    # O bico e os pés do ganso que ficaram com ela (o laranja dele, encostado nas costas ou no pé de
    # trás dela): do lado do ganso, embaixo, o laranja é dele (o rolo dela fica na frente).
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    laranja = (r > 150) & (g > 70) & (g < 190) & (b < 110) & (r - b > 80)
    zona = (xx < esq + 0.42 * w if lado < 0 else xx >= dir_ - 0.42 * w) & (yy > top + 0.4 * h)
    parte[caixa & laranja & zona & (parte == 1)] = 2
    # Pedacinhos soltos (8 vizinhos) de um lado, cercados pelo outro, vão para o outro.
    for quem in (1, 2):
        lab, n = ndimage.label(parte == quem, structure=np.ones((3, 3)))
        if n <= 1:
            continue
        tamanhos = ndimage.sum(parte == quem, lab, range(1, n + 1))
        maior = 1 + int(np.argmax(tamanhos))
        for k in range(1, n + 1):
            if k != maior and tamanhos[k - 1] < 40:
                parte[lab == k] = 3 - quem
    alvo = rotulos[y0:y1, x0:x1]
    alvo[caixa] = parte[caixa]


def main():
    img = np.array(Image.open(FONTE).convert('RGBA'))
    mascara = opacos(img)
    rotulos = np.zeros(mascara.shape, np.int32)
    # As fileiras: cada quadro é um pedaço do desenho (com 2 px de folga, como recorte-sprite.cjs).
    juntos, _ = ndimage.label(ndimage.binary_dilation(mascara, structure=np.ones((5, 5))))
    for (y0, y1) in FILEIRAS:
        # Caída (a fileira DIE), depois do primeiro quadro (ainda de pé), ela fica deitada, com o ganso
        # em pé atrás dela, à direita e mais alto que ela.
        caida = (y0, y1) == FILEIRAS[-1]
        faixa = juntos[y0:y1, :870]
        quadros = []
        for k in np.unique(faixa):
            ys, xs = np.nonzero(faixa == k)
            if k and len(ys) >= 600:
                quadros.append((xs.min(), xs.max() + 1))
        for i, (x0, x1) in enumerate(sorted(quadros)):
            if caida and i > 0:
                separar_quadro(img, mascara, rotulos, y0, y1, x0, x1, 1, 0.0, 0.0)
            else:
                # Na fileira do ataque o ganso muda de lado (ela avança por cima dele); nas outras, à
                # esquerda dela.
                separar_quadro(img, mascara, rotulos, y0, y1, x0, x1, 0 if (y0, y1) == FILEIRAS[6] else -1)
    for (x0, x1), lado in COLUNAS.values():
        for (y0, y1) in LINHAS_DAS_COLUNAS:
            separar_quadro(img, mascara, rotulos, y0, y1, x0, x1, lado)
    # Os extras (embaixo, à direita): os gansos soltos são do ganso; o resto (os rostos, o rolo),
    # dela.
    extras = mascara.copy()
    extras[:900] = False
    extras[:, :870] = False
    lab, n = ndimage.label(ndimage.binary_dilation(extras, structure=np.ones((5, 5))))
    for k in range(1, n + 1):
        ys, xs = np.nonzero((lab == k) & extras)
        if not len(ys):
            continue
        quem = 2 if 1160 <= xs.min() and xs.max() <= 1420 else 1
        rotulos[ys, xs] = quem
    for nome, quem in (('margo.png', 1), ('ganso.png', 2)):
        saida = img.copy()
        saida[..., 3] = np.where(rotulos == quem, img[..., 3], 0)
        saida[saida[..., 3] == 0] = 0  # o vazio todo igual: o arquivo fica bem menor
        Image.fromarray(saida).save(os.path.join(RAIZ, 'fontes', nome))
        print(f'-> fontes/{nome}')


if __name__ == '__main__':
    main()
