# A grama da frente do chão do cenário (tela-inicial.webp), recortada numa faixa, para ir na frente
# do pé das pernas da placa da tela inicial, no mesmo lugar da arte: assim a perna entra no chão
# como uma coisa só com ele.
#  - De dentro do tapete de grama para baixo (e a terra), a faixa é a arte inteira, opaca: a ponta
#    da perna fica escondida (antes, entre as folhas, aparecia o corte reto dela).
#  - Acima disso, só as folhas que nascem do chão (cada pixel verde ligado por baixo a um pixel já
#    incluído), até uma altura máxima, com os buraquinhos de sombra entre elas preenchidos: as
#    moitas do fundo e as folhas soltas ficam de fora e a madeira só aparece entre as folhas.
# Imprime as frações da faixa (topo e base, em pixels inteiros da arte) para o placa.ts.
# Uso: python3 grama-do-chao.py <assets/tela-inicial.webp>
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

arte = sys.argv[1]
im = np.array(Image.open(arte).convert('RGB')).astype(float)
H, W, _ = im.shape
y0 = round(H * 0.862)  # o topo da faixa (o mais alto que uma folha da frente sobe)
LINHA = round(H * 0.897)  # dentro do tapete de grama: daqui para baixo é tudo chão
y1 = round(H * 0.935)  # a base da faixa (já na terra, abaixo do pé da perna)
f = im[y0:y1]
r, g, b = f[..., 0], f[..., 1], f[..., 2]
verde = (g > r * 1.1) & (g > b * 1.05) & (g > 50)  # (mais escuro que isso já é o fundo da floresta)

alfa = np.zeros(f.shape[:2], bool)
alfa[LINHA - y0:] = True
# as folhas: sobem linha a linha, cada pixel verde preso a um incluído logo abaixo (ou na diagonal)
for y in range(LINHA - y0 - 1, -1, -1):
    abaixo = alfa[y + 1]
    preso = abaixo.copy()
    preso[1:] |= abaixo[:-1]
    preso[:-1] |= abaixo[1:]
    alfa[y] = verde[y] & preso

# os buraquinhos escuros entre as folhas (sombra dentro do tapete) entram também, sem fechar o vão
# aberto entre duas folhas
alfa = ndimage.binary_fill_holes(ndimage.binary_closing(alfa, iterations=1) | alfa)
out = np.dstack([f, alfa * 255.0]).astype(np.uint8)
Image.fromarray(out, 'RGBA').save('tela-inicial-grama.png')
print(f'topo {y0}/{H}, base {y1}/{H}')

# O tufo do pé: um trecho de folhas altas e pontudas da mesma grama (x de TUFO_X, 100 pixels da
# arte), em forma de moita: alto no meio e descendo até o tapete nas pontas, para nascer do chão
# em volta da perna sem marcar onde começa. Vai na frente de cada pé (o da direita espelhado).
TUFO_X, TUFO_W = 730, 100
tufo = out[:LINHA - y0, TUFO_X:TUFO_X + TUFO_W].copy()
xs = np.linspace(-1, 1, TUFO_W)
pode = (LINHA - y0) * (1 - np.clip(np.abs(xs) ** 2.2, 0, 1))  # quantas linhas acima do tapete pode subir
for x in range(TUFO_W):
    corte = int(round((LINHA - y0) - pode[x]))
    tufo[:corte, x, 3] = 0
Image.fromarray(tufo, 'RGBA').save('tela-inicial-tufo.png')
print(f'tufo {TUFO_W}x{LINHA - y0}, de {y0} a {LINHA}')
