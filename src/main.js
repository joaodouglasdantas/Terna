const canvas = document.getElementById('jogo');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const LARGURA = canvas.width;
const ALTURA = canvas.height;
const ALTURA_CHAO = 3 * TILE;
const Y_CHAO = ALTURA - ALTURA_CHAO;

const FOLGA_TUFOS = 4;
const chao = criarChao(LARGURA, ALTURA_CHAO, FOLGA_TUFOS);

const ceu = ctx.createLinearGradient(0, 0, 0, Y_CHAO);
ceu.addColorStop(0, '#5fb4f0');
ceu.addColorStop(1, '#bfe6ff');

function desenhar() {
  ctx.fillStyle = ceu;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  ctx.drawImage(chao, 0, Y_CHAO - FOLGA_TUFOS);
}

function loop() {
  desenhar();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
