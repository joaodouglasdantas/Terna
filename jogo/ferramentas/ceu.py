# O céu da tela inicial vivo: tira da arte (tela-inicial.webp) as nuvens de cima e as estrelas, para
# o ceu.ts animar:
#  - tela-inicial-ceu.webp: o céu da arte, um pouco mais nítido no alto, com as nuvens que andam apagadas
#    (o céu refeito por inpainting), na faixa de cima;
#  - tela-inicial-nuvens.webp: as nuvens que andam, cada uma num retângulo (atlas, uma embaixo da
#    outra);
#  - tela-inicial-ceu-frente.webp: o que fica na frente do céu (as copas e as montanhas), para
#    cortar a camada do céu: as nuvens passam por trás delas;
#  - ceu-dados.ts: onde fica cada nuvem e cada estrela (em pixels da arte, 1672 × 940).
# Só andam as nuvens inteiras acima do brilho do horizonte; as baixas e a grande (que encosta nas
# montanhas) ficam paradas na arte. As estrelas da arte ganham a companhia de umas fracas a mais.
# Uso: python3 ceu.py <pasta assets> <saída do ceu-dados.ts>
import sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage

PASTA, SAIDA_TS = sys.argv[1], sys.argv[2]
im = np.array(Image.open(f'{PASTA}/tela-inicial.webp').convert('RGB'))
H, W, _ = im.shape
arvores = np.array(Image.open(f'{PASTA}/tela-inicial-arvores.png').convert('L').resize((W, H))) > 128
ANDA = 14  # quanto (pixels da arte) cada nuvem anda para cada lado, no máximo
TOPO, BASE = 16, 236  # a faixa do céu que a camada cobre (os picos mais altos estão em y 222)
f = im.astype(float)

# --- as montanhas: da primeira linha azul-violeta (5 pixels seguidos) de cada coluna para baixo,
# abaixo de y 200 (o céu ali é laranja, rosa ou magenta; as montanhas são azul-violeta) ---
hsv = cv2.cvtColor(im, cv2.COLOR_RGB2HSV).astype(float)
matiz = hsv[..., 0] / 180
violeta = (matiz > 0.55) & (matiz < 0.8)
violeta[:200] = False
montanhas = np.zeros((H, W), bool)
for x in range(W):
    seguidos = np.convolve(violeta[:, x].astype(int), np.ones(5, int), 'same') >= 5
    ys = np.nonzero(seguidos)[0]
    if len(ys):
        montanhas[ys[0]:, x] = True
# a frente do céu: copas (com folga para o balanço delas) e montanhas
frente = ndimage.binary_dilation(arvores, iterations=3) | montanhas

# --- as nuvens: mais claras/vermelhas que o céu em volta (o céu de fundo vem de um inpainting
# que se refina: chuta as nuvens, refaz o céu sem elas, compara de novo) ---
r = f[..., 0]
fundo_r = np.array([np.percentile(r[y, 330:1340], 25) for y in range(H)])[:, None]
faixa = np.zeros((H, W), bool)
faixa[TOPO:BASE] = True
faixa &= ~frente
nuvem = (r - fundo_r > 28) & faixa
for _ in range(3):
    tira = ndimage.binary_dilation(nuvem, iterations=4).astype(np.uint8) * 255
    ceu = cv2.inpaint(im, tira, 9, cv2.INPAINT_TELEA).astype(float)
    dist = np.sqrt(((f - ceu) ** 2).sum(-1))
    nuvem = (dist > 26) & faixa
    nuvem = ndimage.binary_closing(ndimage.binary_opening(nuvem, iterations=1), iterations=2)
    nuvem = ndimage.binary_fill_holes(nuvem)
# o mesmo, mais frouxo: junta as partes de uma mesma nuvem (as sombras dela são quase da cor do céu)
frouxa = ndimage.binary_dilation((dist > 14) & faixa, iterations=2) | nuvem
rot, n = ndimage.label(frouxa)

# só andam as nuvens inteiras acima do brilho do horizonte (y 205), longe da beirada da faixa
nuvens = []
anda = np.zeros((H, W), bool)
for i, sl in enumerate(ndimage.find_objects(rot), 1):
    grupo = rot == i
    pedaco = grupo & nuvem
    if pedaco.sum() < 150:
        continue
    ys, xs = np.nonzero(pedaco)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    gy = np.nonzero(grupo.any(1))[0]
    if gy.max() > 205 or y0 < TOPO + 2:
        continue
    nuvens.append((x0, y0, x1, y1, pedaco[y0:y1, x0:x1].copy()))
    anda |= pedaco

# --- o céu limpo e mais nítido: a arte com as nuvens que andam apagadas ---
tira = ndimage.binary_dilation(anda, iterations=3).astype(np.uint8) * 255
limpo = cv2.inpaint(im, tira, 12, cv2.INPAINT_TELEA)
rng = np.random.default_rng(1)
ruido = rng.normal(0, 1.6, limpo.shape) * (tira[..., None] > 0)  # o granulado da arte no céu refeito
limpo = np.clip(limpo.astype(float) + ruido, 0, 255).astype(np.uint8)
nitida = lambda a: cv2.addWeighted(a, 1.4, cv2.GaussianBlur(a, (0, 0), 1.1), -0.4, 0)
# mais nítido só no alto do céu, sumindo antes do horizonte (lá embaixo, onde a máscara das
# montanhas pega também um pouco de céu, a camada fica igual à arte e não marca emenda)
peso = np.clip((200 - np.arange(H)) / 25, 0, 1)[:, None, None]
limpo = np.clip(nitida(limpo).astype(float) * peso + limpo.astype(float) * (1 - peso), 0, 255).astype(np.uint8)
# a camada do céu: a faixa inteira, sem a frente (as montanhas e as copas ficam da arte)
cobre = np.zeros((H, W), bool)
cobre[TOPO:BASE] = True
cobre &= ~frente
ys, xs = np.nonzero(cobre)
cy0, cy1, cx0, cx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
# a borda de baixo some aos poucos (sem marcar a linha onde a camada acaba)
alfa = cobre.astype(float)
alfa[BASE - 10:BASE] *= np.linspace(1, 0, 10)[:, None]
ceu_rgba = np.dstack([limpo, alfa * 255]).astype(np.uint8)
Image.fromarray(ceu_rgba[cy0:cy1, cx0:cx1], 'RGBA').save(f'{PASTA}/tela-inicial-ceu.webp', lossless=True)
Image.fromarray(np.dstack([np.zeros((H, W, 3)), frente * 255]).astype(np.uint8)[cy0:cy1, cx0:cx1], 'RGBA').save(
    f'{PASTA}/tela-inicial-ceu-frente.webp', lossless=True)

# --- o atlas das nuvens (uma embaixo da outra), nítidas como o céu, borda de meio pixel ---
viva = nitida(im)
alturas = [y1 - y0 for (_, y0, _, y1, _) in nuvens]
larguras = [x1 - x0 for (x0, _, x1, _, _) in nuvens]
atlas = np.zeros((sum(alturas) + 2 * len(nuvens) + 1, max(larguras), 4), np.uint8)
dados = []
ay = 0
for (x0, y0, x1, y1, m) in nuvens:
    h, w = y1 - y0, x1 - x0
    a = np.clip(cv2.GaussianBlur(ndimage.binary_dilation(m).astype(float), (0, 0), 0.6) * 1.3, 0, 1)
    a = np.maximum(a, m)
    atlas[ay:ay + h, :w, :3] = viva[y0:y1, x0:x1]
    atlas[ay:ay + h, :w, 3] = (a * 255).astype(np.uint8)
    dados.append((int(x0), int(y0), int(w), int(h), int(ay)))
    ay += h + 2
Image.fromarray(atlas, 'RGBA').save(f'{PASTA}/tela-inicial-nuvens.webp', lossless=True)

# --- as estrelas: pontinhos bem mais claros que a vizinhança, no céu escuro de cima, longe das
# nuvens (também de onde elas andam) e das copas ---
L = 0.3 * f[..., 0] + 0.59 * f[..., 1] + 0.11 * f[..., 2]
pico = L - cv2.morphologyEx(L.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)).astype(float)
vizinhanca = cv2.medianBlur(L.astype(np.uint8), 15).astype(float)
longe = ~ndimage.binary_dilation(ndimage.binary_dilation(frouxa | frente, iterations=4),
                                 structure=np.ones((1, 2 * ANDA + 1)))
cand = (pico > 34) & (vizinhanca < 105) & longe
cand[200:] = False
rot, n = ndimage.label(cand)
estrelas = []
for i, sl in enumerate(ndimage.find_objects(rot), 1):
    ys, xs = np.nonzero(rot[sl] == i)
    if len(ys) > 12:
        continue
    forca = float(pico[sl][rot[sl] == i].max())
    estrelas.append((round(sl[1].start + xs.mean(), 1), round(sl[0].start + ys.mean(), 1), round(min(1, forca / 110), 2)))

# e umas estrelinhas fracas a mais, espalhadas no céu escuro do alto (a arte tem poucas): só onde
# o céu é bem escuro, longe das nuvens, das copas e das estrelas da arte
escuro = (vizinhanca < 80) & longe
escuro[:TOPO + 4] = False
escuro[150:] = False
rng = np.random.default_rng(7)
for _ in range(4000):
    if len(estrelas) >= 46:
        break
    x, y = int(rng.integers(0, W)), int(rng.integers(TOPO + 4, 150))
    if escuro[y, x] and all((x - ex) ** 2 + (y - ey) ** 2 > 38 ** 2 for ex, ey, _ in estrelas):
        estrelas.append((float(x), float(y), round(float(rng.uniform(0.18, 0.45)), 2)))

with open(SAIDA_TS, 'w') as s:
    s.write('// Gerado por ferramentas/ceu.py: a camada do céu, as nuvens que andam (onde ficam na arte e\n')
    s.write('// onde estão no atlas tela-inicial-nuvens.webp) e as estrelas, em pixels da arte.\n\n')
    s.write(f'export const ARTE_CEU = {{ largura: {W}, altura: {H} }};\n')
    s.write('// A camada do céu (tela-inicial-ceu.webp e a máscara da frente) começa aqui na arte.\n')
    s.write(f'export const CEU_LIMPO = {{ x: {cx0}, y: {cy0}, w: {cx1 - cx0}, h: {cy1 - cy0} }};\n')
    s.write('// Quanto (pixels da arte) as nuvens andam para cada lado, no máximo.\n')
    s.write(f'export const ANDA = {ANDA};\n\n')
    s.write('// x, y: o canto na arte; w, h: o tamanho; ay: a linha onde ela começa no atlas.\n')
    s.write('export const NUVENS: readonly { x: number; y: number; w: number; h: number; ay: number }[] = [\n')
    for (x, y, w, h, a) in dados:
        s.write(f'  {{ x: {x}, y: {y}, w: {w}, h: {h}, ay: {a} }},\n')
    s.write('];\n\n')
    s.write('// x, y: o meio da estrela na arte; forca: de 0 a 1 (as mais fortes abrem brilho em cruz).\n')
    s.write('export const ESTRELAS: readonly { x: number; y: number; forca: number }[] = [\n')
    for (x, y, k) in estrelas:
        s.write(f'  {{ x: {x}, y: {y}, forca: {k} }},\n')
    s.write('];\n')
print('nuvens', len(nuvens), 'estrelas', len(estrelas), 'camada', (cx0, cy0, cx1, cy1))
if len(sys.argv) > 3:  # prévias
    v = im.copy()
    v[anda] = v[anda] // 2 + np.array([0, 120, 0], np.uint8)
    v[montanhas & (np.arange(H)[:, None] < 300)] //= 2
    for (x, y, k) in estrelas:
        cv2.circle(v, (int(x), int(y)), 5, (255, 255, 0), 1)
    Image.fromarray(v[:320]).save(f'{sys.argv[3]}/ceu-prev-mascara.png')
    Image.fromarray(limpo[:320]).save(f'{sys.argv[3]}/ceu-prev-limpo.png')
