const TILE = 16;

const CORES_CHAO = {
  gramaClara: '#7ddb5a',
  grama: '#4caf3c',
  gramaEscura: '#3b8f2e',
  terra: '#7a4a26',
  terraEscura: '#5e3719',
  terraClara: '#9a6437',
  pedra: '#8b8680',
};

// Pré-renderiza o chão uma vez; `folgaTufos` é o espaço acima da grama para os tufos.
function criarChao(largura, alturaChao, folgaTufos = 4) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = alturaChao + folgaTufos;
  const ctx = canvas.getContext('2d');

  // Semente fixa: o chão sai igual em toda carga, sem "piscar".
  let semente = 7;
  const aleatorio = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
  const inteiro = (max) => Math.floor(aleatorio() * max);

  const topoGrama = folgaTufos;
  const espessuraGrama = 6;
  const topoTerra = topoGrama + espessuraGrama;

  ctx.fillStyle = CORES_CHAO.terra;
  ctx.fillRect(0, topoTerra, largura, canvas.height - topoTerra);

  const alturaTerra = canvas.height - topoTerra;
  for (let i = 0; i < (largura * alturaTerra) / 18; i++) {
    const r = aleatorio();
    const x = inteiro(largura);
    const y = topoTerra + 3 + inteiro(alturaTerra - 3);
    if (r < 0.6) {
      ctx.fillStyle = CORES_CHAO.terraEscura;
      ctx.fillRect(x, y, 2, 1);
    } else if (r < 0.9) {
      ctx.fillStyle = CORES_CHAO.terraClara;
      ctx.fillRect(x, y, 1, 1);
    } else if (r < 0.97) {
      ctx.fillStyle = CORES_CHAO.pedra;
      ctx.fillRect(x, y, 3, 2);
      ctx.fillStyle = CORES_CHAO.terraEscura;
      ctx.fillRect(x, y + 2, 3, 1);
    }
  }

  ctx.fillStyle = CORES_CHAO.grama;
  ctx.fillRect(0, topoGrama, largura, espessuraGrama);
  ctx.fillStyle = CORES_CHAO.gramaClara;
  ctx.fillRect(0, topoGrama, largura, 1);

  // Borda irregular da grama escorrendo sobre a terra.
  for (let x = 0; x < largura; x += 2) {
    const comprimento = inteiro(4);
    ctx.fillStyle = CORES_CHAO.gramaEscura;
    ctx.fillRect(x, topoTerra, 2, comprimento);
  }

  // Tufos acima da faixa de grama.
  for (let x = 0; x < largura; x++) {
    if (aleatorio() < 0.18) {
      const altura = 1 + inteiro(folgaTufos);
      ctx.fillStyle = aleatorio() < 0.5 ? CORES_CHAO.grama : CORES_CHAO.gramaClara;
      ctx.fillRect(x, topoGrama - altura, 1, altura);
    }
  }

  return canvas;
}
