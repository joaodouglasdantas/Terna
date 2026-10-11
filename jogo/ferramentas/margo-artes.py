"""As artes grandes da Margo, da cena dela na cozinha (fontes/margo-cozinha.png, 2048x512: a Margo
com o rolo e o ganso): o retrato (os cartões da escolha e da tela dos personagens) e a arte da cena
de ult (fontes/ult-margo.png, que ferramentas/ult.py reduz como as outras).

Uso (na pasta jogo/):  python3 ferramentas/margo-artes.py  e depois  python3 ferramentas/ult.py

- O retrato: a Margo de corpo inteiro, recortada pelo rosto e ampliada 3x sem suavizar (os outros
  retratos têm 477x1513; a cena tem 512 de altura, então 504 linhas viram 1512).
- A ult: o rosto dela e o do ganso lado a lado (a cena reduzida à metade: o pixel dela fica perto
  do do cenário na tela), com o ganso de olho vermelho e sobrancelha brava — o Ganso Raivoso.
  Gravada em 3x (1536 de largura), como as artes que ult.py reduz a 1/3.
"""
import os

from PIL import Image

RAIZ = os.path.join(os.path.dirname(__file__), '..')
CENA = os.path.join(RAIZ, 'fontes', 'margo-cozinha.png')

RETRATO = {'x': 851, 'largura': 159, 'y': 4, 'altura': 504}  # na cena: o meio do rosto em x ~930, os olhos em y ~150
ULT = {'x': 700, 'largura': 1024}  # a Margo (755 a 1015) e o ganso (1340 a 1615)
# O olho do ganso na cena e a sobrancelha brava (em pixels da cena, já que ela é ampliada).
OLHO_DO_GANSO = (1529, 146, 15, 19)
VERMELHO = (224, 34, 34)
SOBRANCELHA = (34, 20, 16)


def main():
    cena = Image.open(CENA).convert('RGB')

    r = RETRATO
    retrato = cena.crop((r['x'], r['y'], r['x'] + r['largura'], r['y'] + r['altura']))
    retrato = retrato.resize((r['largura'] * 3, r['altura'] * 3), Image.NEAREST)
    destino = os.path.join(RAIZ, 'apps', 'cliente', 'src', 'assets', 'retratos', 'margo.webp')
    retrato.save(destino, 'WEBP', quality=92, method=6)
    print(f'-> {os.path.relpath(destino, RAIZ)} ({retrato.width}x{retrato.height})')

    brava = cena.copy()
    x, y, w, h = OLHO_DO_GANSO
    px = brava.load()
    # O olho: o escuro dele vira vermelho (o brilho branco fica); a sobrancelha, grossa como um
    # pixel da cena, desce para o bico.
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            r_, g_, b_ = px[xx, yy]
            if r_ + g_ + b_ < 200:
                px[xx, yy] = VERMELHO
    for k in range(28):
        for grossura in range(6):
            px[x - 8 + k, y - 12 + (k * 9) // 28 + grossura] = SOBRANCELHA
    u = ULT
    ult = brava.crop((u['x'], 0, u['x'] + u['largura'], cena.height))
    ult = ult.resize((u['largura'] // 2, cena.height // 2), Image.BOX)
    ult = ult.resize((ult.width * 3, ult.height * 3), Image.NEAREST)
    destino = os.path.join(RAIZ, 'fontes', 'ult-margo.png')
    ult.save(destino)
    print(f'-> {os.path.relpath(destino, RAIZ)} ({ult.width}x{ult.height})')


if __name__ == '__main__':
    main()
