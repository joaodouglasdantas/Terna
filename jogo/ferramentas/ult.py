# As artes da cena de ult (o corte que passa na tela quando sai o especial):
# reduz cada arte de fontes/ult-<heroi>.png a 1/3, por média de área (sem o borrado da
# suavização), para o pixel dela ficar do tamanho do pixel do cenário na tela de 480x270.
# Uso (da pasta jogo/): python3 ferramentas/ult.py
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / 'apps/cliente/src/assets/ult'
SAIDA.mkdir(parents=True, exist_ok=True)

for fonte in sorted((RAIZ / 'fontes').glob('ult-*.png')):
    heroi = fonte.stem.removeprefix('ult-')
    arte = Image.open(fonte).convert('RGB').reduce(3)
    destino = SAIDA / f'{heroi}.webp'
    arte.save(destino, 'WEBP', quality=92, method=6)  # lossy alto: ~4x menor que sem perda, sem diferença no tamanho da tela
    print(f'{destino.relative_to(RAIZ)}: {arte.width}x{arte.height}, {destino.stat().st_size // 1024} KB')
