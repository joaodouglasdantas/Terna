# A placa de madeira da tela inicial, montada a partir da referência (1024×1024):
#  - placa-quadro.png: o quadro (os toquinhos de cima, as vigas e o painel), mais largo que a
#    referência (o meio repetido) e com uma tora a menos, com o letreiro "TERNA" desenhado à mão
#    em pixel art (letreiro.py) no painel;
#  - placa-perna-esq/dir.png: um trecho da perna que se repete para baixo (a altura até o chão muda
#    com a tela). A grama do pé vem da própria arte do cenário (ferramentas/grama-do-chao.py).
# Uso: python3 montar-placa.py <referência da placa>
# As cores vão um pouco para as da madeira do cenário, com a luz do sol pela direita.
import json
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

ref = sys.argv[1]
a = np.array(Image.open(ref).convert('RGB')).astype(float)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
# A madeira (e o contorno escuro dela): vermelho acima do azul e não verde. O céu é azul e a
# grama e os morros são verdes.
madeira = (r >= g - 6) & (r > b + 10)
madeira = ndimage.binary_opening(madeira, iterations=1)
rot, n = ndimage.label(madeira)
maior = np.argmax(ndimage.sum(madeira, rot, range(1, n + 1))) + 1
madeira = ndimage.binary_fill_holes(rot == maior)

def cor_do_cenario(rgb):
    # Puxa para a madeira do cenário: um pouco mais quente e saturada, com mais contraste.
    hsv = Image.fromarray(rgb.astype(np.uint8)).convert('HSV')
    h, s, v = [np.array(c).astype(float) for c in hsv.split()]
    h = (h - 2) % 256
    s = np.clip(s * 1.18 + 6, 0, 255)
    v = np.clip((v - 128) * 1.12 + 122, 0, 255)
    out = Image.merge('HSV', [Image.fromarray(x.astype(np.uint8)) for x in (h, s, v)]).convert('RGB')
    return np.array(out).astype(float)

def com_sol(rgb, x0, largura_total):
    # A luz do sol pela direita: mais quente e clara à direita, mais fria e escura à esquerda.
    w = rgb.shape[1]
    t = (np.arange(w) + x0) / largura_total
    t = t[None, :, None]
    quente = np.array([1.10, 1.02, 0.90]); frio = np.array([0.80, 0.78, 0.92])
    return np.clip(rgb * (frio + (quente - frio) * t), 0, 255)

def rgba(rgb, msk):
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), msk * 255.0]).astype(np.uint8), 'RGBA')

# --- o quadro: da ponta dos toquinhos (y 48) até a viga de baixo (y 677) ---
Y0, Y1 = 46, 678
X0, X1 = 166, 856
cor = cor_do_cenario(a)
q = cor[Y0:Y1, X0:X1]
m = madeira[Y0:Y1, X0:X1].astype(float)
# um pouco mais baixo: tira uma tora (de 308 a 377 da referência; as linhas das toras ficam na
# emenda e o painel, de veio deitado, emenda sem marca)
CORTE = (308 - Y0, 377 - Y0)
q = np.concatenate([q[:CORTE[0]], q[CORTE[1]:]], 0)
m = np.concatenate([m[:CORTE[0]], m[CORTE[1]:]], 0)
# mais largo: repete a faixa do meio (x 440 a 600), sem os pregos e sem as molduras
fx0, fx1 = 440 - X0, 600 - X0
REPETE = 4
q = np.concatenate([q[:, :fx1]] + [q[:, fx0:fx1]] * (REPETE - 1) + [q[:, fx1:]], 1)
m = np.concatenate([m[:, :fx1]] + [m[:, fx0:fx1]] * (REPETE - 1) + [m[:, fx1:]], 1)
# os toquinhos só existem em cima das pernas: no meio repetido não há (a faixa é abaixo deles)
larg = q.shape[1]

# --- o letreiro "TERNA" no painel: em pixel art, na fonte da logo (letreiro.py), ampliado no pixel
# da placa (6 px) e no meio do painel ---
from letreiro import letreiro
extra_w = (fx1 - fx0) * (REPETE - 1)
PX0, PX1 = 328 - X0, 668 - X0 + extra_w
PY0, PY1 = 222 - Y0, 546 - Y0 - (CORTE[1] - CORTE[0])
P = 6
let = letreiro(forma=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'letreiro-forma.png'))
let = let.crop(let.getbbox())
let = np.array(let.resize((let.width * P, let.height * P), Image.NEAREST)).astype(float)
lh, lw = let.shape[:2]
ox = PX0 + ((PX1 - PX0) - lw) // 2
oy = PY0 + ((PY1 - PY0) - lh) // 2
al = let[..., 3:4] / 255

q = com_sol(q, 0, larg)
# o letreiro depois da luz do sol da placa, com uma luz mais suave (o creme continua quente do lado
# da sombra, sem acinzentar)
t = ((np.arange(lw) + ox) / larg)[None, :, None]
luz = np.array([0.93, 0.9, 0.9]) + (np.array([1.04, 1.01, 0.96]) - np.array([0.93, 0.9, 0.9])) * t
q[oy:oy + lh, ox:ox + lw] = q[oy:oy + lh, ox:ox + lw] * (1 - al) + np.clip(let[..., :3] * luz, 0, 255) * al
rgba(q, m).save('placa-quadro.png')

# --- as pernas: onde ficam no quadro (em px do quadro) ---
extra = (fx1 - fx0) * (REPETE - 1)
pernas = [(252 - X0, 360 - X0), (668 - X0 + extra, 778 - X0 + extra)]
# o trecho que se repete (y 700 a 820) e o pé (y 820 a 880), da perna da esquerda
def recorte_perna(xa, xb, ya, yb, x_no_quadro):
    rgb = cor[ya:yb, xa:xb]; msk = madeira[ya:yb, xa:xb].astype(float)
    return com_sol(rgb, x_no_quadro, larg), msk
ESQ = (252, 362)
tr, tm = recorte_perna(ESQ[0], ESQ[1], 700, 820, pernas[0][0])
rgba(tr, tm).save('placa-perna-esq.png')
tr2, tm2 = recorte_perna(ESQ[0], ESQ[1], 700, 820, pernas[1][0])
rgba(tr2, tm2).save('placa-perna-dir.png')

info = {'quadro': [larg, q.shape[0]], 'pernas': pernas, 'perna': [ESQ[1] - ESQ[0], 120]}
json.dump(info, open('placa.json', 'w'))
print(info)
prev = Image.new('RGBA', (larg, q.shape[0]), (110, 80, 120, 255)); prev.alpha_composite(Image.open('placa-quadro.png'))
prev.convert('RGB').resize((larg // 2, q.shape[0] // 2)).save('prev-placa.png')
