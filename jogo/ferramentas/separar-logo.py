# Separa a logo de madeira com flores em camadas para animar:
#  - logo.webp: a base (madeira, musgo preso nas letras, contorno), sem os cipós soltos e sem as flores;
#  - logo-partes.png: os cipós e as flores, cada um num retângulo (atlas);
#  - logo-partes.ts: onde cada parte fica na logo e onde está no atlas, mais as pontas dos cipós
#    (de onde caem os pedacinhos de musgo) e o musgo de cima (onde o orvalho brilha).
import json
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

# Uso: python3 separar-logo.py <logo da temporada, PNG com fundo transparente>
# (gera logo-base.png, logo-partes.png e logo-partes.json na pasta atual)
src = Image.open(sys.argv[1]).convert('RGBA')
a = np.array(src).astype(float)
a[a[..., 3] < 110, 3] = 0  # as franjas quase transparentes (os pontinhos avermelhados em volta)
bb = Image.fromarray(a.astype(np.uint8)).getchannel('A').getbbox()
P = 6
x0, y0, x1, y1 = bb[0] - P, bb[1] - P, bb[2] + P, bb[3] + P
a = a[y0:y1, x0:x1]
H, W = a.shape[:2]
rgb = a[..., :3]; al = a[..., 3]
solido = al > 128
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn
h = np.zeros_like(mx); m = d > 1e-6
rr = m & (mx == r); gg = m & (mx == g) & ~rr; bbm = m & ~rr & ~gg
h[rr] = ((g - b)[rr] / d[rr]) % 6; h[gg] = (b - r)[gg] / d[gg] + 2; h[bbm] = (r - g)[bbm] / d[bbm] + 4
h /= 6; s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0); v = mx / 255

escuro = solido & (v < 0.2)
verde = solido & (h > 0.13) & (h < 0.42) & (s > 0.2) & ~escuro
# flores: pétalas rosadas/brancas e o miolo amarelo
rosa = solido & (r > 185) & (b > 120) & (b > g * 0.85) & (r >= g) & ~verde
branco = solido & (mn > 185) & (d < 70)
miolo = solido & (r > 200) & (g > 140) & (b < 110)
madeira = solido & ~verde & ~escuro & ~rosa & ~branco

# --- flores ---
semente = rosa | branco
semente = ndimage.binary_opening(semente, iterations=1)
grupos = ndimage.binary_dilation(semente, iterations=5)
rot, n = ndimage.label(grupos)
flores = []
mascara_flor = np.zeros_like(solido)
for i, sl in enumerate(ndimage.find_objects(rot), 1):
    reg = (rot == i)
    pet = reg & (rosa | branco | miolo)
    if pet.sum() < 60:
        continue
    ys, xs = np.nonzero(pet)
    fy0, fy1, fx0, fx1 = ys.min() - 2, ys.max() + 3, xs.min() - 2, xs.max() + 3
    msk = np.zeros_like(solido); msk[fy0:fy1, fx0:fx1] = True
    # a borda rosa-escura/vermelha das pétalas entra também
    avermelhado = ((h < 0.04) | (h > 0.88)) & (s > 0.25)
    msk &= (ndimage.binary_dilation(pet, iterations=2) | (ndimage.binary_dilation(pet, iterations=5) & avermelhado)) & solido
    msk = ndimage.binary_fill_holes(msk) & solido  # o miolo amarelo no meio entra também
    mascara_flor |= msk
    flores.append((fx0, fy0, fx1, fy1, msk[fy0:fy1, fx0:fx1].copy()))

# --- cipós soltos: os fios finos de musgo longe da madeira (com o contorno escuro deles). O musgo
# grosso de cima das letras (sobrevive a uma erosão) fica na base, preso.
musgo_area = verde | (escuro & ndimage.binary_dilation(verde, iterations=2))
grosso = ndimage.binary_erosion(musgo_area, iterations=8)
grosso = ndimage.binary_dilation(grosso, iterations=12) & musgo_area
perto = ndimage.binary_dilation(madeira, iterations=7) | grosso
cipo = verde & ~perto & ~mascara_flor
cipo = ndimage.binary_opening(cipo, iterations=1)
# o fio inteiro: o musgo e tudo de sólido em volta dele (contorno e beiradas), longe das letras
cipo_tudo = ndimage.binary_dilation(cipo, iterations=4) & solido & ~ndimage.binary_dilation(madeira | grosso, iterations=2) & ~mascara_flor
rot, n = ndimage.label(ndimage.binary_dilation(cipo_tudo, iterations=2) & cipo_tudo | cipo_tudo)
cipos = []
mascara_cipo = np.zeros_like(solido)
for i, sl in enumerate(ndimage.find_objects(rot), 1):
    reg = (rot == i) & cipo_tudo
    if reg.sum() < 150:
        continue
    ys, xs = np.nonzero(reg)
    cy0, cy1, cx0, cx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    if cy1 - cy0 < 18:  # só os que pendem (altos o bastante para balançar)
        continue
    mascara_cipo |= reg
    cipos.append((cx0, cy0, cx1, cy1, reg[cy0:cy1, cx0:cx1].copy()))

# --- a base: sem os cipós; no lugar das flores, o que está em volta (preenchido do vizinho) ---
base = a.copy()
base[mascara_cipo, 3] = 0
if mascara_flor.any():
    # preenche com o que está um pouco mais longe (fora da borda rosada), para não sobrar fantasma
    tapa = ndimage.binary_dilation(mascara_flor, iterations=3) & solido
    # só pixels sólidos de fora servem de fonte (os transparentes têm cor qualquer)
    _, (iy, ix) = ndimage.distance_transform_edt(tapa | ~solido, return_indices=True)
    base[tapa, :3] = a[iy[tapa], ix[tapa], :3]
Image.fromarray(base.astype(np.uint8), 'RGBA').save('logo-base.png')

# --- o atlas: as partes lado a lado numa faixa ---
partes = []
sprites = []
for tipo, lista in (('cipo', cipos), ('flor', flores)):
    for (px0, py0, px1, py1, msk) in lista:
        sp = np.zeros((py1 - py0, px1 - px0, 4))
        sp[msk] = a[py0:py1, px0:px1][msk]
        sprites.append(sp)
        partes.append({'tipo': tipo, 'x': int(px0), 'y': int(py0), 'w': int(px1 - px0), 'h': int(py1 - py0)})
larg = sum(sp.shape[1] + 2 for sp in sprites)
alt = max(sp.shape[0] for sp in sprites)
atlas = np.zeros((alt, larg, 4))
cx = 0
for p, sp in zip(partes, sprites):
    atlas[:sp.shape[0], cx:cx + sp.shape[1]] = sp
    p['ax'] = cx
    cx += sp.shape[1] + 2
Image.fromarray(atlas.astype(np.uint8), 'RGBA').save('logo-partes.png')

# pontas dos cipós (o pixel mais baixo de cada um) e o musgo de cima das letras (preso na madeira)
pontas = [{'u': round((p['x'] + p['w'] / 2) / W, 4), 'v': round((p['y'] + p['h']) / H, 4)} for p in partes if p['tipo'] == 'cipo']
musgo_preso = verde & ~mascara_cipo
rot, n = ndimage.label(ndimage.binary_dilation(musgo_preso, iterations=4))
topo = []
for i, sl in enumerate(ndimage.find_objects(rot), 1):
    if ((rot[sl] == i) & musgo_preso[sl]).sum() < 400:
        continue
    topo.append({'u': [round(sl[1].start / W, 4), round(sl[1].stop / W, 4)], 'v': [round(sl[0].start / H, 4), round(sl[0].stop / H, 4)]})

print('tamanho', W, H, 'cipós', len(cipos), 'flores', len(flores), 'musgo', len(topo))
json.dump({'largura': W, 'altura': H, 'partes': partes, 'pontas': pontas, 'musgo': topo}, open('logo-partes.json', 'w'))
# prévias
bg = Image.new('RGBA', (W, H), (110, 80, 120, 255)); bg.alpha_composite(Image.open('logo-base.png')); bg.convert('RGB').resize((W // 2, H // 2)).save('prev-base.png')
at = Image.open('logo-partes.png'); bg = Image.new('RGBA', at.size, (110, 80, 120, 255)); bg.alpha_composite(at); bg.convert('RGB').save('prev-partes.png')
