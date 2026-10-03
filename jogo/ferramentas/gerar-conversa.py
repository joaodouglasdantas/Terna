# Gera assets/conversa.png: a Leslie e o Grow sentados de costas na grama da tela inicial, vendo o
# pôr do sol (inicio/conversa.ts). Sai do quadro "parado" de cada um (assets/leslie.png e
# assets/grow/sem-cajado.png): o rosto e a frente do corpo viram cabelo e roupa (a vista de
# costas), as pernas somem (sentados, elas ficam para a frente, escondidas pelo corpo) e a cabeça
# tem três jeitos — de costas (olhando o sol), virada para a esquerda e para a direita (mostrando a
# bochecha e um olho, do rosto de frente). A luz é a do sol na frente deles: o corpo fica na
# contraluz (mais escuro e arroxeado) com a borda acesa de laranja do lado do sol.
#
# Uso (da pasta jogo): python3 ferramentas/gerar-conversa.py
# Cada quadro fica numa faixa de 32×32, na ordem de QUADROS (abaixo), igual a inicio/conversa.ts.

from PIL import Image

QUADRO = 32

HEROIS = {
    # rosto: (linha de cima, de baixo, coluna da esquerda, da direita), de onde vem o cabelo que
    # cobre (linhas para cima), até onde vai o corpo sentado, o corpo coberto de cabelo (Leslie).
    'grow': dict(arquivo='apps/cliente/src/assets/grow/sem-cajado.png', w=21, h=33,
                 rosto=(9, 13, 6, 15), cabelo_de=5, corpo_ate=28, costas=None, meio=11),
    'leslie': dict(arquivo='apps/cliente/src/assets/leslie.png', w=16, h=31,
                   rosto=(7, 13, 3, 12), cabelo_de=5, corpo_ate=23, costas=(14, 21, 3, 12), meio=8),
}


def pele(p):
    r, g, b, a = p
    return a > 128 and r > 150 and g > 105 and r > g > b and r - b > 40


def tons_do_cabelo(px, h):
    # Os tons do cabelo: os pixels de cima da cabeça que não são pele, do escuro ao claro.
    tons = []
    for y in range(0, 7):
        for x in range(h['w']):
            p = px[x, y]
            if p[3] > 128 and not pele(p):
                tons.append(p)
    tons.sort(key=lambda p: p[0] + p[1] + p[2])
    n = len(tons)
    return [tons[int(n * q)] for q in (0.15, 0.4, 0.62, 0.85)]


def sorteio(x, y):
    import math
    v = math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return v - math.floor(v)


def cabelo(tons, x, y, x0, x1, y_fundo):
    # Mechas: faixas verticais que alternam de tom, mais escuras embaixo e nas beiradas.
    mecha = (x * 5 + (y // 3)) % 3
    k = 1.6 + (mecha - 1) * 0.7 + (sorteio(x, y) - 0.5) * 0.8
    if x in (x0, x1):
        k -= 0.8
    k -= max(0, (y - (y_fundo - 3))) * 0.3
    return tons[max(0, min(len(tons) - 1, round(k)))]


def costas(nome):
    h = HEROIS[nome]
    frente = Image.open(h['arquivo']).convert('RGBA').crop((0, 0, h['w'], h['h']))
    im = frente.copy()
    px = im.load()
    tons = tons_do_cabelo(px, h)
    y0, y1, x0, x1 = h['rosto']
    # O rosto vira cabelo (as orelhas, nas beiradas, ficam).
    for y in range(0, y1 + 1):
        for x in range(x0, x1 + 1):
            if px[x, y][3] > 0 and (y >= y0 or pele(px[x, y])):
                px[x, y] = cabelo(tons, x, y, x0, x1, y1)
    # As costas: a Leslie tem o cabelo comprido descendo nelas; o Grow, a roupa (sem a pele do peito).
    if h['costas']:
        c0, c1, cx0, cx1 = h['costas']
        for y in range(c0, c1 + 1):
            for x in range(cx0, cx1 + 1):
                if px[x, y][3] > 0:
                    px[x, y] = cabelo(tons, x, y, cx0, cx1, c1)
    for y in range(y1 + 1, h['corpo_ate']):
        for x in range(h['w']):
            if pele(px[x, y]):
                vizinho = px[max(0, x - 1), y]
                px[x, y] = vizinho if not pele(vizinho) and vizinho[3] > 0 else (70, 45, 30, 255)
    return frente, im


# A cabeça virada para a direita (vista de trás, três quartos): a orelha do lado de lá some, a do
# lado de cá vai para trás do rosto, e o perfil do rosto aparece na beirada (a bochecha, o
# nariz passando um pouco do cabelo, o olho e a franja por cima). Para a esquerda é o espelho.
# Cada pixel: (coluna, linha, cor); None apaga.
PERFIS = {
    'leslie': dict(
        # as duas orelhas de trás somem (a de lá fica escondida; a de cá vem para o lado do rosto)
        apagar=[(0, 6), (1, 6), (0, 7), (1, 7), (1, 8), (2, 8), (2, 9), (14, 6), (15, 6), (14, 7), (15, 7)],
        pintar=[
            # o contorno do cabelo onde ficavam as orelhas
            (1, 9, '1d2615'), (2, 8, '1d2615'), (2, 7, '2c3721'), (2, 9, '3d492a'), (13, 7, '191d11'),
            # a orelha de cá, entre o cabelo e o rosto, com a ponta para cima
            (9, 7, 'e3a37c'), (9, 8, 'c88968'), (10, 8, 'ac7355'),
            # a franja caindo na testa
            (11, 8, '4c5c33'), (12, 8, '55673a'), (13, 8, '191d11'),
            # o rosto de perfil: o olho, a bochecha, o nariz e o queixo
            (10, 9, '45522d'), (11, 9, '100e09'), (12, 9, 'f1c299'), (13, 9, 'c88968'), (14, 9, '1d2615'),
            (10, 10, '3d492a'), (11, 10, 'f1c299'), (12, 10, 'fde2ba'), (13, 10, 'f1c299'), (14, 10, 'e3a37c'), (15, 10, '1d2615'),
            (11, 11, 'e3a37c'), (12, 11, 'fde2ba'), (13, 11, 'e3a37c'), (14, 11, '1d2615'),
            (12, 12, 'c88968'), (13, 12, '10180d'),
        ],
        cabeca_ate=13,
        meio=7.5,
    ),
    'grow': dict(
        apagar=[],
        pintar=[
            # a orelha de cá, saindo do cabelo
            (13, 10, 'c7a18a'), (13, 11, 'ad846f'), (12, 11, '91604b'),
            # a franja por cima do olho
            (15, 9, '58352c'), (16, 9, '4e3229'), (17, 9, '603c31'),
            # o rosto de perfil: o olho, a bochecha, o nariz e o queixo
            (14, 10, '462b24'), (15, 10, '0d0403'), (16, 10, 'c7a18a'), (17, 10, 'eac2a9'), (18, 10, 'ad846f'), (19, 10, '190404'),
            (14, 11, '4e3229'), (15, 11, 'c7a18a'), (16, 11, 'eac2a9'), (17, 11, 'fbe6cc'), (18, 11, 'eac2a9'), (19, 11, 'c7a18a'), (20, 11, '190404'),
            (15, 12, 'eac2a9'), (16, 12, 'eac2a9'), (17, 12, 'eac2a9'), (18, 12, 'ad846f'), (19, 12, '190404'),
            (16, 13, 'c7a18a'), (17, 13, '91604b'), (18, 13, '030001'),
        ],
        cabeca_ate=14,
        meio=11.5,
    ),
}


def cor(texto):
    return (int(texto[0:2], 16), int(texto[2:4], 16), int(texto[4:6], 16), 255)


def virada(nome, frente, de_costas, lado):
    h = HEROIS[nome]
    perfil = PERFIS[nome]
    im = de_costas.copy()
    px = im.load()
    for x, y in perfil['apagar']:
        px[x, y] = (0, 0, 0, 0)
    for x, y, c in perfil['pintar']:
        px[x, y] = cor(c)
    if lado < 0:
        # Para a esquerda: a cabeça espelhada em volta do meio dela (o corpo fica como está).
        alto = perfil['cabeca_ate']
        antes = {(x, y): px[x, y] for x in range(h['w']) for y in range(alto)}
        for x in range(h['w']):
            for y in range(alto):
                origem = round(2 * perfil['meio'] - x)
                px[x, y] = antes.get((origem, y), (0, 0, 0, 0))
    return im


def sentado(nome, im):
    h = HEROIS[nome]
    corpo = im.crop((0, 0, h['w'], h['corpo_ate']))
    # A base do corpo sentado: a última linha um pouco mais larga e escura (o quadril na grama).
    px = corpo.load()
    ultima = h['corpo_ate'] - 1
    for x in range(h['w']):
        if px[x, ultima][3] > 0:
            r, g, b, a = px[x, ultima]
            px[x, ultima] = (int(r * 0.7), int(g * 0.7), int(b * 0.7), 255)
    return corpo


def contraluz(im):
    # O sol na frente deles: o corpo na sombra (mais escuro e arroxeado) e a borda de cima e da
    # direita acesas de laranja.
    im = im.copy()
    px = im.load()
    w, h = im.size
    original = im.copy().load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = original[x, y]
            if a == 0:
                continue
            if pele(original[x, y]):
                # A pele (o rosto virado, as mãos) pega a luz do sol: só esquenta.
                px[x, y] = (min(255, int(r * 0.98 + 8)), int(g * 0.88 + 4), int(b * 0.8), a)
            else:
                px[x, y] = (int(r * 0.8 + 12), int(g * 0.72 + 6), int(b * 0.74 + 20), a)
            dentro = lambda xx, yy: 0 <= xx < w and 0 <= yy < h and original[xx, yy][3] > 0
            borda_direita = not dentro(x + 1, y)
            borda_de_cima = not dentro(x, y - 1)
            if borda_direita or borda_de_cima:
                forca = 0.7 if borda_direita and borda_de_cima else 0.5
                rr, gg, bb, _ = px[x, y]
                px[x, y] = (int(rr + (255 - rr) * forca), int(gg + (165 - gg) * forca), int(bb + (90 - bb) * forca), a)
    return im


QUADROS = [
    ('grow', 'costas'), ('grow', 'esquerda'), ('grow', 'direita'),
    ('leslie', 'costas'), ('leslie', 'esquerda'), ('leslie', 'direita'),
]


def main():
    folha = Image.new('RGBA', (QUADRO * len(QUADROS), QUADRO), (0, 0, 0, 0))
    for i, (nome, jeito) in enumerate(QUADROS):
        frente, de_costas = costas(nome)
        im = de_costas if jeito == 'costas' else virada(nome, frente, de_costas, -1 if jeito == 'esquerda' else 1)
        im = contraluz(sentado(nome, im))
        # Encostado embaixo e centrado na faixa.
        x = i * QUADRO + (QUADRO - im.width) // 2
        folha.paste(im, (x, QUADRO - im.height), im)
    folha.save('apps/cliente/src/assets/conversa.png')


if __name__ == '__main__':
    main()
